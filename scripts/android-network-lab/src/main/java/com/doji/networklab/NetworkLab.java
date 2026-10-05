package com.doji.networklab;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import okhttp3.*;

/** Native OkHttp controls, NOT a reproduction of the production incident or full RN app. */
public final class NetworkLab extends Instrumentation {
  private int passed;
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }
  private void check(boolean condition, String label) {
    if (!condition) throw new AssertionError(label);
    passed++;
    Bundle result = new Bundle(); result.putString("stream", "PASS " + label + "\n");
    sendStatus(0, result);
  }
  private Request request(String url) { return new Request.Builder().url(url).build(); }
  @Override public void onStart() {
    Bundle summary = new Bundle();
    try (Fixture server = new Fixture()) {
      // RN's normal builder has no timeouts; bound this harness at the call level.
      OkHttpClient client = new OkHttpClient.Builder()
          .connectTimeout(0, TimeUnit.MILLISECONDS).readTimeout(0, TimeUnit.MILLISECONDS)
          .writeTimeout(0, TimeUnit.MILLISECONDS).callTimeout(2, TimeUnit.SECONDS)
          .cache(new Cache(new File(getTargetContext().getCacheDir(), "lab-http"), 10 * 1024 * 1024))
          .build();
      try {
        int count = server.count.get();
        try (Response response = client.newCall(request(server.url("/remote504"))).execute()) {
          check(response.code() == 504 && response.networkResponse() != null,
              "server 504 has native network provenance");
          check(response.header("sb-request-id") == null && response.header("content-type") == null,
              "a remote 504 can also lack provider IDs and content type");
        }
        check(server.count.get() == count + 1, "server 504 reached loopback server once");
        count = server.count.get();
        Request cacheOnly = request(server.url("/uncached")).newBuilder()
            .cacheControl(CacheControl.FORCE_CACHE).build();
        try (Response response = client.newCall(cacheOnly).execute()) {
          check(response.code() == 504 && response.networkResponse() == null && response.cacheResponse() == null,
              "forced cache miss creates local 504 with no network provenance");
          check(response.message().equals("Unsatisfiable Request (only-if-cached)"),
              "synthetic 504 reason phrase is available natively");
        }
        check(server.count.get() == count, "forced cache miss did not reach server");
        try (Response response = client.newCall(request(server.url("/uncached"))).execute()) {
          check(response.code() == 200 && response.networkResponse() != null,
              "normal request with same cache reaches network successfully");
        }
        for (String identity : new String[]{"synthetic-a", "synthetic-b"}) {
          try (Response response = client.newCall(request(server.url("/private")).newBuilder()
              .header("Authorization", "Bearer " + identity).build()).execute()) {
            check(response.code() == 200 && response.cacheResponse() == null,
                "no-store synthetic private response is not served from cache: " + identity);
          }
        }
        OkHttpClient shortCall = client.newBuilder().callTimeout(100, TimeUnit.MILLISECONDS).build();
        try (Response ignored = shortCall.newCall(request(server.url("/stall"))).execute()) {
          throw new AssertionError("deadline must fail rather than return HTTP504");
        } catch (InterruptedIOException expected) { check(true, "native call deadline throws instead of returning HTTP504"); }
        Call cancelled = client.newCall(request(server.url("/ok"))); cancelled.cancel();
        try (Response ignored = cancelled.execute()) { throw new AssertionError("cancelled call must fail"); }
        catch (IOException expected) { check(true, "cancelled call throws instead of returning HTTP504"); }
        int closedPort;
        try (ServerSocket reservation = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
          closedPort = reservation.getLocalPort();
        }
        try (Response ignored = client.newCall(request("http://127.0.0.1:" + closedPort + "/")).execute()) {
          throw new AssertionError("closed local socket must fail");
        } catch (IOException expected) { check(true, "connection refusal throws instead of returning HTTP504"); }
        try (Response response = client.newCall(request(server.url("/ok"))).execute()) {
          check(response.code() == 200, "same client recovers after cancellation and connection failure");
        }
        ReactNetworkControls.run(getTargetContext(), server, this::check);
        NativeHintControls.run(getTargetContext(), this::check);
        FaultControls.run(getTargetContext(), this::check);
        ExpoClientControls.run(getTargetContext(), this::check);
        summary.putString("stream", "PASS " + passed + " native control assertions; production cause remains unknown.\n");
        finish(Activity.RESULT_OK, summary);
      } finally {
        client.dispatcher().executorService().shutdownNow();
        client.connectionPool().evictAll(); client.cache().close();
      }
    } catch (Throwable failure) {
      summary.putString("stream", "FAIL " + failure.getClass().getSimpleName() + ": " + failure.getMessage());
      finish(Activity.RESULT_CANCELED, summary);
    }
  }
  static final class Fixture implements AutoCloseable {
    final ServerSocket socket;
    final AtomicInteger count = new AtomicInteger();
    final ExecutorService workers = Executors.newCachedThreadPool();
    Fixture() throws IOException {
      socket = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"));
      workers.submit(() -> { while (!socket.isClosed()) {
        try { Socket accepted = socket.accept(); workers.submit(() -> respond(accepted)); }
        catch (IOException stopped) { break; }
      }});
    }
    String url(String path) { return "http://127.0.0.1:" + socket.getLocalPort() + path; }
    void respond(Socket accepted) {
      try (Socket peer = accepted) {
        peer.setSoTimeout(2000);
        BufferedReader input = new BufferedReader(new InputStreamReader(peer.getInputStream(), StandardCharsets.US_ASCII));
        String first = input.readLine(); if (first == null) return;
        String header; while ((header = input.readLine()) != null && !header.isEmpty()) { /* discard synthetic headers */ }
        count.incrementAndGet();
        if (first.contains("/stall")) Thread.sleep(400);
        String status = first.contains("/remote504") ? "504 Gateway Timeout" : "200 OK";
        peer.getOutputStream().write(("HTTP/1.1 " + status + "\r\nContent-Length: 2\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n[]").getBytes(StandardCharsets.US_ASCII));
      } catch (IOException expectedDisconnect) { /* cancelled controls close the socket */ }
      catch (InterruptedException stopped) { Thread.currentThread().interrupt(); }
    }
    public void close() throws IOException { socket.close(); workers.shutdownNow(); }
  }
}
