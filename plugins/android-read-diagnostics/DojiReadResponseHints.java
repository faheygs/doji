package com.doji.network;

import com.facebook.react.modules.network.NetworkingModule;
import java.io.IOException;
import okhttp3.Interceptor;
import okhttp3.Request;
import okhttp3.Response;

/** Passive, Android-only response evidence. Never changes or repeats a request. */
public final class DojiReadResponseHints implements Interceptor {
  public static final String VERSION = "x-doji-native-read-version";
  public static final String SOURCE = "x-doji-native-response-source";
  public static final String CACHE_ONLY = "x-doji-native-request-cache-only";
  public static final String PROTOCOL = "x-doji-native-protocol";
  public static final String HEADERS_MS = "x-doji-native-network-headers-ms";
  public static final String PRIOR_COUNT = "x-doji-native-prior-response-count";
  private final String host;
  private final String gatewayHost;

  public DojiReadResponseHints(String host) { this(host, ""); }
  public DojiReadResponseHints(String host, String gatewayHost) {
    this.host = host;
    this.gatewayHost = gatewayHost;
  }

  public static void install(String host) {
    install(host, "");
  }

  public static void install(String host, String gatewayHost) {
    // RN fallback only. Expo's separate client gets this observer at its own
    // builder through the version-pinned Android plugin, not a global factory.
    NetworkingModule.setCustomClientBuilder(builder -> {
      // RN applies its custom builder to each request's copied client.
      for (Interceptor existing : builder.interceptors()) {
        if (existing instanceof DojiReadResponseHints) return;
      }
      builder.addInterceptor(new DojiReadResponseHints(host, gatewayHost));
    });
  }

  @Override public Response intercept(Chain chain) throws IOException {
    Request request = chain.request();
    Response response = chain.proceed(request); // exactly once, including writes
    String path = request.url().encodedPath();
    boolean directRead = request.url().host().equals(host) && path.startsWith("/rest/v1/");
    boolean gatewayRead = !gatewayHost.isEmpty() && request.url().host().equals(gatewayHost) &&
        (path.startsWith("/v1/feed/") || path.startsWith("/v1/posts/") ||
         path.startsWith("/v1/polls/") || path.startsWith("/v1/profiles/"));
    // RPCs use POST even when their purpose is a read. Observe only the fixed
    // RPC route families; never replay them, consume a body or change a request.
    boolean rpcPost = request.method().equals("POST") &&
        ((request.url().host().equals(host) && path.matches("/rest/v1/rpc/[a-z][a-z0-9_]*")) ||
         (!gatewayHost.isEmpty() && request.url().host().equals(gatewayHost) &&
          path.matches("/commands/rpc/[a-z][a-z0-9_]*")));
    boolean qualifiedRead = (directRead || gatewayRead) &&
        (request.method().equals("GET") || request.method().equals("HEAD"));
    if (response.code() != 504 || !request.url().isHttps() || !(qualifiedRead || rpcPost)) return response;

    String source = "unknown";
    if (response.networkResponse() != null) source = "network";
    else if (response.cacheResponse() != null) source = "cache";
    else if (request.cacheControl().onlyIfCached() &&
        response.message().equals("Unsatisfiable Request (only-if-cached)")) source = "local_cache_miss";
    // These are LOCAL response headers, never outgoing HTTP headers. Overwrite
    // matching server headers so a server cannot impersonate native provenance.
    // Do not inspect/consume bodies, credentials, cookies, query strings or IDs.
    Response.Builder annotated = response.newBuilder()
        .header(VERSION, rpcPost ? "3" : "2")
        .header(SOURCE, source)
        .header(CACHE_ONLY, request.cacheControl().onlyIfCached() ? "true" : "false")
        .removeHeader(PROTOCOL).removeHeader(HEADERS_MS).removeHeader(PRIOR_COUNT);
    Response network = response.networkResponse();
    if (network != null) {
      String protocol = network.protocol().toString();
      if (protocol.equals("http/1.0") || protocol.equals("http/1.1") || protocol.equals("h2") ||
          protocol.equals("h2_prior_knowledge")) annotated.header(PROTOCOL, protocol);
      long sent = network.sentRequestAtMillis();
      long received = network.receivedResponseAtMillis();
      // Network headers only: excludes DNS/connect/TLS and body, not DB execution time.
      // Never report historical cached timestamps or invalid/clock-reversed durations.
      if (sent > 0 && received >= sent) annotated.header(HEADERS_MS, Long.toString(Math.min(120000L, received - sent)));
    }
    int prior = 0;
    for (Response previous = response.priorResponse(); previous != null && prior < 20; previous = previous.priorResponse()) prior++;
    // Prior responses include redirects/auth follow-ups, NOT application retry attempts.
    return annotated.header(PRIOR_COUNT, Integer.toString(prior)).build();
  }
}
