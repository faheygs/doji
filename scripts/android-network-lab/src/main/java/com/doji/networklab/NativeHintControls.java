package com.doji.networklab;

import android.content.Context;
import com.doji.network.DojiReadResponseHints;
import com.facebook.react.modules.network.NetworkingModule;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import okhttp3.*;
import okhttp3.mockwebserver.*;
import okhttp3.tls.*;

/** TLS is trusted only for this local synthetic server; never disables verification. */
final class NativeHintControls {
  static void run(Context context, BiConsumer<Boolean, String> check) throws Exception {
    HeldCertificate certificate = new HeldCertificate.Builder().commonName("localhost")
        .addSubjectAlternativeName("localhost").build();
    HandshakeCertificates serverTls = new HandshakeCertificates.Builder().heldCertificate(certificate).build();
    HandshakeCertificates clientTls = new HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate()).build();
    try (MockWebServer server = new MockWebServer()) {
      server.useHttps(serverTls.sslSocketFactory(), false); server.start();
      OkHttpClient client = new OkHttpClient.Builder()
          .sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager())
          .callTimeout(3, TimeUnit.SECONDS).addInterceptor(new DojiReadResponseHints("localhost")).build();
      Request read = new Request.Builder().url(server.url("/rest/v1/user_shop_items"))
          .header("Authorization", "Bearer synthetic-native").build();
      try {
        server.enqueue(new MockResponse().setResponseCode(504).setBody("[]")
            .setHeader(DojiReadResponseHints.SOURCE, "local_cache_miss")
            .setHeader(DojiReadResponseHints.HEADERS_MS, "9999999")
            .setHeader(DojiReadResponseHints.PRIOR_COUNT, "19")
            .setHeader(DojiReadResponseHints.PROTOCOL, "private-server-value"));
        try (Response response = client.newCall(read).execute()) {
          check.accept("network".equals(response.header(DojiReadResponseHints.SOURCE)) &&
              "false".equals(response.header(DojiReadResponseHints.CACHE_ONLY)),
              "real TLS response overwrites spoofed provenance with native network evidence");
          check.accept("2".equals(response.header(DojiReadResponseHints.VERSION)) &&
              response.networkResponse().protocol().toString().equals(response.header(DojiReadResponseHints.PROTOCOL)) &&
              Long.parseLong(response.header(DojiReadResponseHints.HEADERS_MS)) >= 0 &&
              Long.parseLong(response.header(DojiReadResponseHints.HEADERS_MS)) <= 120000 &&
              "0".equals(response.header(DojiReadResponseHints.PRIOR_COUNT)),
              "v2 replaces spoofed timing/protocol/count with bounded native metadata");
          check.accept(response.code() == 504 && "[]".equals(response.body().string()),
              "observer preserves real HTTP error status and body");
        }
        RecordedRequest sent = server.takeRequest(2, TimeUnit.SECONDS);
        check.accept(sent != null && sent.getHeader(DojiReadResponseHints.VERSION) == null &&
            sent.getHeader(DojiReadResponseHints.SOURCE) == null && sent.getHeader(DojiReadResponseHints.CACHE_ONLY) == null &&
            sent.getHeader(DojiReadResponseHints.HEADERS_MS) == null && sent.getHeader(DojiReadResponseHints.PROTOCOL) == null &&
            sent.getHeader(DojiReadResponseHints.PRIOR_COUNT) == null &&
            "Bearer synthetic-native".equals(sent.getHeader("Authorization")),
            "native metadata is never transmitted and authorization is unchanged");
        int before = server.getRequestCount();
        try (Response response = client.newCall(read.newBuilder().cacheControl(CacheControl.FORCE_CACHE).build()).execute()) {
          check.accept(response.code() == 504 && "local_cache_miss".equals(response.header(DojiReadResponseHints.SOURCE)) &&
              "true".equals(response.header(DojiReadResponseHints.CACHE_ONLY)),
              "native observer identifies exact cache-only miss without reason-text logging");
          check.accept(response.header(DojiReadResponseHints.HEADERS_MS) == null &&
              response.header(DojiReadResponseHints.PROTOCOL) == null,
              "cache-only miss does not invent network timing or protocol");
        }
        check.accept(before == server.getRequestCount(), "observer never replays a cache-only failure");
        server.enqueue(new MockResponse().setResponseCode(302).setHeader("Location", server.url("/rest/v1/redirected")));
        server.enqueue(new MockResponse().setResponseCode(504).setBody("[]"));
        try (Response response = client.newCall(read).execute()) {
          check.accept("1".equals(response.header(DojiReadResponseHints.PRIOR_COUNT)) && response.code() == 504,
              "existing redirect chain is counted without changing follow-up behavior");
        }
        server.takeRequest(2, TimeUnit.SECONDS); server.takeRequest(2, TimeUnit.SECONDS);
        for (int status : new int[]{200, 401, 429, 500}) {
          server.enqueue(new MockResponse().setResponseCode(status).setBody("[]"));
          try (Response response = client.newCall(read).execute()) {
            check.accept(response.code() == status && response.header(DojiReadResponseHints.VERSION) == null,
                "non-504 response is untouched: " + status);
          }
          server.takeRequest(2, TimeUnit.SECONDS);
        }
        for (Request excluded : new Request[]{read.newBuilder().post(RequestBody.create("{}", MediaType.get("application/json"))).build(),
            read.newBuilder().url(server.url("/auth/v1/token")).build()}) {
          server.enqueue(new MockResponse().setResponseCode(504));
          try (Response response = client.newCall(excluded).execute()) {
            check.accept(response.header(DojiReadResponseHints.VERSION) == null,
                "write or auth request excluded from native annotations");
          }
          server.takeRequest(2, TimeUnit.SECONDS);
        }
        OkHttpClient otherHost = new OkHttpClient.Builder().sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager())
                .callTimeout(3, TimeUnit.SECONDS).addInterceptor(new DojiReadResponseHints("unrelated.invalid")).build();
        server.enqueue(new MockResponse().setResponseCode(504));
        try (Response response = otherHost.newCall(read).execute()) {
          check.accept(response.header(DojiReadResponseHints.VERSION) == null, "other hosts excluded from native annotations");
        } finally { otherHost.connectionPool().evictAll(); otherHost.dispatcher().executorService().shutdownNow(); }
        server.takeRequest(2, TimeUnit.SECONDS);

        // Confirm these local-only response hints really survive RN's native bridge.
        ReactNetworkControls.Events events = new ReactNetworkControls.Events(context);
        OkHttpClient.Builder bridgeBuilder = client.newBuilder();
        bridgeBuilder.interceptors().clear();
        DojiReadResponseHints.install("localhost");
        NetworkingModule network = new NetworkingModule(events, null, bridgeBuilder.build(), null);
        server.enqueue(new MockResponse().setResponseCode(504));
        events.expect(201);
        network.sendRequest("GET", read.url().toString(), 201, ReactNetworkControls.headers(false), null, "text", false, 0, false);
        events.await();
        check.accept(events.response != null && "network".equals(events.response.getMap(2).getString(DojiReadResponseHints.SOURCE)),
            "real server 504 provenance reaches RN JavaScript event headers");
        check.accept(events.response != null && "2".equals(events.response.getMap(2).getString(DojiReadResponseHints.VERSION)) &&
            events.response.getMap(2).hasKey(DojiReadResponseHints.HEADERS_MS) &&
            events.response.getMap(2).hasKey(DojiReadResponseHints.PROTOCOL),
            "v2 network timing and protocol survive the real native RN bridge");
        server.takeRequest(2, TimeUnit.SECONDS);
        events.expect(202);
        network.sendRequest("GET", read.url().toString(), 202, ReactNetworkControls.headers(true), null, "text", false, 0, false);
        events.await();
        check.accept(events.response != null && "local_cache_miss".equals(events.response.getMap(2).getString(DojiReadResponseHints.SOURCE)),
            "synthetic 504 provenance reaches RN JavaScript event headers");
        network.invalidate();
      } finally {
        NetworkingModule.setCustomClientBuilder(null);
        client.connectionPool().evictAll(); client.dispatcher().executorService().shutdownNow();
      }
    }
  }
}
