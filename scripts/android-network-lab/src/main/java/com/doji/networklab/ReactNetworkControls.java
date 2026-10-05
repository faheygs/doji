package com.doji.networklab;

import android.content.Context;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.network.NetworkingModule;
import com.facebook.react.modules.network.OkHttpClientProvider;
import com.facebook.react.soloader.OpenSourceMergedSoMapping;
import com.facebook.soloader.SoLoader;
import java.util.concurrent.*;
import java.util.function.BiConsumer;
import okhttp3.OkHttpClient;

/** Execute the real RN native module; intercept only emitted JS events, not HTTP. */
final class ReactNetworkControls {
  static final class Events extends BridgeReactContext {
    volatile ReadableArray response;
    volatile ReadableArray completion;
    volatile String body;
    volatile CountDownLatch done = new CountDownLatch(1);
    private int activeRequestId = -1;
    private boolean settled;
    Events(Context context) { super(context); }
    @Override public boolean hasActiveReactInstance() { return true; }
    @Override public synchronized void emitDeviceEvent(String name, Object args) {
      ReadableArray values = (ReadableArray) args;
      // Mirror XHR's request-id fencing and unsubscribe after first completion.
      // RN may emit a trailing success after a body-read error; do not overwrite
      // the first terminal event or let it race a later request in this harness.
      if (values.getInt(0) != activeRequestId || settled) return;
      if (name.equals("didReceiveNetworkResponse")) response = values;
      if (name.equals("didReceiveNetworkData")) body = values.getString(1);
      if (name.equals("didCompleteNetworkResponse")) { completion = values; settled = true; done.countDown(); }
    }
    synchronized void expect(int id) { activeRequestId = id; settled = false; response = null; completion = null; body = null; done = new CountDownLatch(1); }
    void await() throws Exception {
      if (!done.await(5, TimeUnit.SECONDS)) throw new AssertionError("RN native request failed to settle");
    }
  }
  static JavaOnlyArray headers(boolean cacheOnly) {
    JavaOnlyArray values = new JavaOnlyArray();
    values.pushArray(JavaOnlyArray.of("authorization", "Bearer synthetic-native"));
    if (cacheOnly) values.pushArray(JavaOnlyArray.of("cache-control", "only-if-cached, max-stale=2147483647"));
    return values;
  }
  static void run(Context context, NetworkLab.Fixture server, BiConsumer<Boolean, String> check) throws Exception {
    SoLoader.init(context, OpenSourceMergedSoMapping.INSTANCE);
    Events events = new Events(context);
    OkHttpClient client = OkHttpClientProvider.createClient(context).newBuilder()
        .callTimeout(3, TimeUnit.SECONDS).build();
    NetworkingModule network = new NetworkingModule(events, null, client, null);
    try {
      events.expect(101);
      network.sendRequest("GET", server.url("/remote504"), 101, headers(false), null, "text", false, 0, false);
      events.await();
      check.accept(events.response != null && events.response.getInt(1) == 504 && events.completion.isNull(1),
          "RN reports actual server 504 as HTTP response, not connection error");
      check.accept(events.response.size() == 4 && "[]".equals(events.body),
          "RN native event contains status/headers/URL and body but no reason phrase");
      events.expect(102);
      int before = server.count.get();
      network.sendRequest("GET", server.url("/rn-cache-miss"), 102, headers(true), null, "text", false, 0, false);
      events.await();
      check.accept(events.response != null && events.response.getInt(1) == 504 && server.count.get() == before,
          "RN forced cache miss emits indistinguishable HTTP status without reaching network");
      events.expect(103);
      network.sendRequest("GET", server.url("/rn-cache-miss"), 103, headers(false), null, "text", false, 0, false);
      events.await();
      check.accept(events.response != null && events.response.getInt(1) == 200 && server.count.get() == before + 1,
          "RN normal request recovers after forced cache miss without changing client");
      events.expect(104);
      network.sendRequest("GET", server.url("/stall"), 104, headers(false), null, "text", false, 50, false);
      events.await();
      check.accept(events.response == null && !events.completion.isNull(1),
          "RN native timeout reports failure, not HTTP504");
      events.expect(105);
      network.sendRequest("GET", server.url("/ok"), 105, headers(false), null, "text", false, 0, false);
      events.await();
      check.accept(events.response != null && events.response.getInt(1) == 200,
          "RN normal read recovers after native timeout");
    } finally {
      network.invalidate();
      client.dispatcher().executorService().shutdownNow();
      client.connectionPool().evictAll();
      if (client.cache() != null) client.cache().close();
    }
  }
}
