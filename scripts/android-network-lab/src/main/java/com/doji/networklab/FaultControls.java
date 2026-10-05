package com.doji.networklab;

import android.content.Context;
import com.doji.network.DojiReadResponseHints;
import com.facebook.react.modules.network.NetworkingModule;
import com.facebook.react.modules.network.OkHttpClientProvider;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import okhttp3.*;
import okhttp3.mockwebserver.*;
import okhttp3.tls.*;

/** Local fault injection through RN's native module; no production endpoints. */
final class FaultControls {
  static void run(Context context, BiConsumer<Boolean, String> check) throws Exception {
    HeldCertificate certificate = new HeldCertificate.Builder().commonName("localhost")
        .addSubjectAlternativeName("localhost").build();
    HandshakeCertificates serverTls = new HandshakeCertificates.Builder().heldCertificate(certificate).build();
    HandshakeCertificates clientTls = new HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate()).build();
    String[] names = {"disconnect at start", "stalled headers", "stalled body",
        "connection lost during body", "malformed status line", "body slower than deadline"};
    MockResponse[] failures = {
        new MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START),
        new MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE),
        new MockResponse().setBody("[]").setBodyDelay(2, TimeUnit.SECONDS),
        new MockResponse().setBody("x".repeat(16384)).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY),
        new MockResponse().setStatus("HTTP/1.1 invalid"),
        new MockResponse().setBody("x".repeat(2048)).throttleBody(32, 250, TimeUnit.MILLISECONDS)
    };
    for (int i = 0; i < failures.length; i++) {
      try (MockWebServer server = new MockWebServer()) {
        server.useHttps(serverTls.sslSocketFactory(), false); server.start();
        OkHttpClient client = OkHttpClientProvider.createClient().newBuilder()
            .sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager())
            .callTimeout(2, TimeUnit.SECONDS).addInterceptor(new DojiReadResponseHints("localhost")).build();
        ReactNetworkControls.Events events = new ReactNetworkControls.Events(context);
        NetworkingModule network = new NetworkingModule(events, null, client, null);
        try {
          server.enqueue(failures[i]);
          events.expect(300 + i);
          network.sendRequest("GET", server.url("/rest/v1/user_shop_items").toString(), 300 + i,
              ReactNetworkControls.headers(false), null, "text", false, 250, false);
          events.await();
          check.accept(events.completion != null && !events.completion.isNull(1),
              names[i] + " settles as a native error (status=" +
              (events.response == null ? "none" : events.response.getInt(1)) + ", bodyBytes=" +
              (events.body == null ? 0 : events.body.length()) + ", completionError=" +
              (events.completion == null ? "missing" : !events.completion.isNull(1)) + ")");
          check.accept(events.response == null || events.response.getInt(1) != 504,
              names[i] + " does not spontaneously create HTTP504");
          events.expect(400 + i);
          server.enqueue(new MockResponse().setBody("[]").setHeader("Cache-Control", "no-store"));
          network.sendRequest("GET", server.url("/rest/v1/user_shop_items").toString(), 400 + i,
              ReactNetworkControls.headers(false), null, "text", false, 1000, false);
          events.await();
          check.accept(events.response != null && events.response.getInt(1) == 200 &&
              events.completion.isNull(1) && "[]".equals(events.body),
              "same RN module recovers after " + names[i]);
        } finally {
          network.invalidate(); client.connectionPool().evictAll();
          client.dispatcher().executorService().shutdownNow();
        }
      }
    }
    // A severed keep-alive connection must not invent an HTTP response on reuse.
    try (MockWebServer server = new MockWebServer()) {
      server.useHttps(serverTls.sslSocketFactory(), false); server.start();
      OkHttpClient client = OkHttpClientProvider.createClient().newBuilder()
          .sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager())
          .callTimeout(2, TimeUnit.SECONDS).addInterceptor(new DojiReadResponseHints("localhost")).build();
      ReactNetworkControls.Events events = new ReactNetworkControls.Events(context);
      NetworkingModule network = new NetworkingModule(events, null, client, null);
      try {
        for (int attempt = 0; attempt < 12; attempt++) {
          server.enqueue(new MockResponse().setBody("[]").setHeader("Cache-Control", "no-store")
              .setSocketPolicy(SocketPolicy.DISCONNECT_AT_END));
          events.expect(500 + attempt);
          network.sendRequest("GET", server.url("/rest/v1/user_shop_items").toString(), 500 + attempt,
              ReactNetworkControls.headers(false), null, "text", false, 1000, false);
          events.await();
          check.accept(events.response != null && events.response.getInt(1) == 200 && events.completion.isNull(1),
              "closed keep-alive recovery read " + (attempt + 1));
        }
      } finally {
        network.invalidate(); client.connectionPool().evictAll();
        client.dispatcher().executorService().shutdownNow();
      }
    }
  }
}
