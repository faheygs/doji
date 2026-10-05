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

/** Exercises Expo's provider and scoped builder, not the full Expo JS/JSI bridge. */
final class ExpoClientControls {
  static void run(Context context, BiConsumer<Boolean, String> check) throws Exception {
    HeldCertificate cert = new HeldCertificate.Builder().commonName("localhost").addSubjectAlternativeName("localhost").build();
    HandshakeCertificates serverTls = new HandshakeCertificates.Builder().heldCertificate(cert).build();
    HandshakeCertificates clientTls = new HandshakeCertificates.Builder().addTrustedCertificate(cert.certificate()).build();
    // Reproduce the old coverage bug before testing the new factory: Expo never
    // invokes NetworkingModule's request-builder hook.
    DojiReadResponseHints.install("localhost");
    OkHttpClient before = OkHttpClientProvider.createClient(context);
    check.accept(before.interceptors().stream().noneMatch(i -> i instanceof DojiReadResponseHints),
        "old RN-only hook is absent from Expo createClient(context)");
    DojiReadResponseHints.install("localhost", "localhost");
    OkHttpClient observed = before.newBuilder().addInterceptor(new DojiReadResponseHints("localhost", "localhost")).build();
    check.accept(observed.interceptors().stream().filter(i -> i instanceof DojiReadResponseHints).count() == 1,
        "scoped Expo client builder receives exactly one observer");
    check.accept(OkHttpClientProvider.createClient().cache() == null,
        "unrelated context-free client retains its no-cache default");
    check.accept(observed.connectTimeoutMillis() == before.connectTimeoutMillis() &&
        observed.readTimeoutMillis() == before.readTimeoutMillis() && observed.writeTimeoutMillis() == before.writeTimeoutMillis() &&
        observed.cookieJar().getClass() == before.cookieJar().getClass() &&
        observed.cache().directory().equals(before.cache().directory()) && observed.cache().maxSize() == before.cache().maxSize() &&
        observed.followRedirects() == before.followRedirects() && observed.retryOnConnectionFailure() == before.retryOnConnectionFailure(),
        "observer preserves default timeouts, cookies, cache, redirects and retry behavior");
    OkHttpClient client = observed.newBuilder().sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager())
        .callTimeout(3, TimeUnit.SECONDS).build();
    try (MockWebServer server = new MockWebServer()) {
      server.useHttps(serverTls.sslSocketFactory(), false); server.start();
      for (String path : new String[]{"/rest/v1/user_shop_items", "/v1/feed/synthetic", "/v1/posts/synthetic/engagement",
          "/v1/polls/synthetic/summary", "/v1/profiles/synthetic"}) {
        server.enqueue(new MockResponse().setResponseCode(504).setBody("synthetic")
            .setHeader(DojiReadResponseHints.SOURCE, "local_cache_miss"));
        Request request = new Request.Builder().url(server.url(path)).header("Authorization", "Bearer synthetic").build();
        try (Response response = client.newCall(request).execute()) {
          check.accept(response.code() == 504 && "network".equals(response.header(DojiReadResponseHints.SOURCE)) &&
              "synthetic".equals(response.body().string()), "Expo provider observes real HTTPS 504 unchanged: " + path);
        }
        RecordedRequest sent = server.takeRequest(2, TimeUnit.SECONDS);
        check.accept(sent != null && "Bearer synthetic".equals(sent.getHeader("Authorization")) &&
            sent.getHeader(DojiReadResponseHints.SOURCE) == null && sent.getHeader(DojiReadResponseHints.VERSION) == null,
            "no outgoing diagnostics or credential changes: " + path);
      }
      int count = server.getRequestCount();
      for (String path : new String[]{"/rest/v1/rpc/get_current_doji_state", "/commands/rpc/request_friendship"}) {
        for (boolean instrumented : new boolean[]{false, true}) {
          OkHttpClient compared = instrumented ? client : before.newBuilder()
              .sslSocketFactory(clientTls.sslSocketFactory(), clientTls.trustManager()).callTimeout(3, TimeUnit.SECONDS).build();
          server.enqueue(new MockResponse().setResponseCode(504).setBody("synthetic-post"));
          Request post = new Request.Builder().url(server.url(path)).header("Authorization", "Bearer synthetic")
              .post(RequestBody.create(MediaType.get("application/json"), "{\"synthetic\":true}")).build();
          try (Response response = compared.newCall(post).execute()) {
            check.accept(response.code() == 504 && "synthetic-post".equals(response.body().string()) &&
                (instrumented ? "3".equals(response.header(DojiReadResponseHints.VERSION)) &&
                  "network".equals(response.header(DojiReadResponseHints.SOURCE)) : response.header(DojiReadResponseHints.VERSION) == null),
                "POST baseline/observer preserves exact HTTP failure: " + path + " observed=" + instrumented);
          }
          RecordedRequest sent = server.takeRequest(2, TimeUnit.SECONDS);
          check.accept(sent != null && "POST".equals(sent.getMethod()) && "Bearer synthetic".equals(sent.getHeader("Authorization")) &&
              "{\"synthetic\":true}".equals(sent.getBody().readUtf8()) && sent.getHeader(DojiReadResponseHints.VERSION) == null,
              "POST dispatch keeps method, credentials and body unchanged: " + path + " observed=" + instrumented);
        }
        check.accept(server.getRequestCount() == count + 2, "POST observer never replays a command: " + path);
        count = server.getRequestCount();
      }
      try (Response response = client.newCall(new Request.Builder().url(server.url("/v1/feed/cache-miss"))
          .cacheControl(CacheControl.FORCE_CACHE).build()).execute()) {
        check.accept("local_cache_miss".equals(response.header(DojiReadResponseHints.SOURCE)) && server.getRequestCount() == count,
            "gateway cache-only miss is distinguished without sending a request");
      }
      for (String path : new String[]{"/commands/rpc/synthetic", "/auth/v1/token", "/portal/synthetic"}) {
        server.enqueue(new MockResponse().setResponseCode(504));
        try (Response response = client.newCall(new Request.Builder().url(server.url(path)).build()).execute()) {
          check.accept(response.header(DojiReadResponseHints.VERSION) == null, "unrelated route remains excluded: " + path);
        }
        server.takeRequest(2, TimeUnit.SECONDS);
      }
      server.enqueue(new MockResponse().setResponseCode(200).setBody("recovered"));
      try (Response response = client.newCall(new Request.Builder().url(server.url("/v1/feed/recovered")).build()).execute()) {
        check.accept(response.code() == 200 && response.header(DojiReadResponseHints.VERSION) == null &&
            "recovered".equals(response.body().string()), "same Expo provider recovers with successful response untouched");
      }
    } finally {
      OkHttpClientProvider.setOkHttpClientFactory(null);
      NetworkingModule.setCustomClientBuilder(null);
      client.connectionPool().evictAll(); client.dispatcher().executorService().shutdownNow();
      observed.cache().close();
    }
  }
}
