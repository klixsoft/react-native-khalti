package com.klixsoft.khalti;

import android.app.Activity;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;
import com.khalti.checkout.Khalti;
import com.khalti.checkout.data.Environment;
import com.khalti.checkout.data.KhaltiPayConfig;
import com.khalti.checkout.data.PaymentPayload;
import com.khalti.checkout.data.PaymentResult;
import com.khalti.checkout.resource.OnMessageEvent;
import com.khalti.checkout.resource.OnMessagePayload;

import java.util.Map;

/**
 * Bridges the official Khalti Checkout SDK to JavaScript.
 *
 * Only one checkout can be open at a time. The pending promise is settled exactly once: with the
 * payment result, or with a coded error when the checkout is closed or fails. When the SDK reports
 * that the outcome needs confirming, the module asks the SDK to verify it once before giving up.
 */
@ReactModule(name = KhaltiModule.NAME)
public class KhaltiModule extends NativeKhaltiSpec {
  public static final String NAME = "KlixsoftKhalti";

  private static final String E_CANCELLED = "E_CANCELLED";
  private static final String E_NETWORK = "E_NETWORK";
  private static final String E_LOOKUP_FAILED = "E_LOOKUP_FAILED";
  private static final String E_RETURN_URL = "E_RETURN_URL";
  private static final String E_IN_PROGRESS = "E_IN_PROGRESS";
  private static final String E_NO_PRESENTER = "E_NO_PRESENTER";
  private static final String E_INVALID_ARGUMENTS = "E_INVALID_ARGUMENTS";
  private static final String E_UNKNOWN = "E_UNKNOWN";

  @Nullable private Promise pending;
  @Nullable private Khalti khalti;
  private boolean verificationRequested;

  public KhaltiModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @NonNull
  @Override
  public String getName() {
    return NAME;
  }

  @Override
  public void pay(
    String publicKey,
    String pidx,
    String paymentUrl,
    String environment,
    boolean openInKhalti,
    Promise promise
  ) {
    final Activity activity = getReactApplicationContext().getCurrentActivity();
    if (activity == null) {
      promise.reject(E_NO_PRESENTER, "There is no foreground activity to open the Khalti checkout from.");
      return;
    }
    if (publicKey == null || publicKey.isEmpty() || pidx == null || pidx.isEmpty()) {
      promise.reject(E_INVALID_ARGUMENTS, "publicKey and pidx are required.");
      return;
    }

    synchronized (this) {
      if (pending != null) {
        promise.reject(E_IN_PROGRESS, "A Khalti checkout is already open.");
        return;
      }
      pending = promise;
      verificationRequested = false;
    }

    final Environment env = "production".equalsIgnoreCase(environment) ? Environment.PROD : Environment.TEST;

    UiThreadUtil.runOnUiThread(() -> {
      try {
        final KhaltiPayConfig config = new KhaltiPayConfig(publicKey, pidx, openInKhalti, env, paymentUrl == null ? "" : paymentUrl);
        khalti = Khalti.Companion.init(activity, config, this::onPaymentResult, this::onMessage);
        khalti.open();
      } catch (Exception error) {
        settleWithError(E_UNKNOWN, error.getMessage() == null ? "Could not open the Khalti checkout." : error.getMessage());
      }
    });
  }

  @Override
  public void cancel() {
    UiThreadUtil.runOnUiThread(() -> {
      final Khalti current = khalti;
      if (current != null) {
        current.close();
      }
      settleWithError(E_CANCELLED, "The Khalti checkout was closed.");
    });
  }

  @Override
  public void invalidate() {
    settleWithError(E_CANCELLED, "The Khalti checkout was closed.");
    super.invalidate();
  }

  private void onPaymentResult(PaymentResult result, Khalti instance) {
    final Promise promise = takePending();
    closeQuietly(instance);
    if (promise != null) {
      promise.resolve(toMap(result));
    }
  }

  private void onMessage(OnMessagePayload payload, Khalti instance) {
    if (payload.getNeedsPaymentConfirmation() && !verificationRequested) {
      verificationRequested = true;
      instance.verify();
      return;
    }

    final OnMessageEvent event = payload.getEvent();
    final String message = payload.getMessage() == null ? "Khalti reported a problem." : payload.getMessage();
    final String code;
    if (event == OnMessageEvent.KPGDisposed) {
      code = E_CANCELLED;
    } else if (event == OnMessageEvent.NetworkFailure) {
      code = E_NETWORK;
    } else if (event == OnMessageEvent.PaymentLookUpFailure || event == OnMessageEvent.TransactionDetailLookUpFailure) {
      code = E_LOOKUP_FAILED;
    } else if (event == OnMessageEvent.ReturnUrlLoadFailure) {
      code = E_RETURN_URL;
    } else {
      code = E_UNKNOWN;
    }

    closeQuietly(instance);
    settleWithError(code, message);
  }

  private synchronized Promise takePending() {
    final Promise promise = pending;
    pending = null;
    khalti = null;
    return promise;
  }

  private void settleWithError(String code, String message) {
    final Promise promise = takePending();
    if (promise != null) {
      promise.reject(code, message);
    }
  }

  private void closeQuietly(@Nullable Khalti instance) {
    try {
      if (instance != null) {
        instance.close();
      }
    } catch (Exception ignored) {
    }
  }

  private WritableMap toMap(PaymentResult result) {
    final WritableMap map = Arguments.createMap();
    map.putString("status", result.getStatus());
    map.putString("message", result.getMessage());

    final PaymentPayload payload = result.getPayload();
    if (payload != null) {
      map.putString("pidx", payload.getPidx());
      map.putDouble("totalAmount", payload.getTotalAmount());
      map.putString("transactionId", payload.getTransactionId());
      map.putDouble("fee", payload.getFee());
      map.putBoolean("refunded", payload.getRefunded());
      map.putString("purchaseOrderId", payload.getPurchaseOrderId());
      map.putString("purchaseOrderName", payload.getPurchaseOrderName());

      final Map<String, Object> extra = payload.getExtraMerchantParams();
      if (extra != null) {
        map.putMap("extraMerchantParams", Arguments.makeNativeMap(extra));
      }
    }
    return map;
  }
}
