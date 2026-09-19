import Foundation
import UIKit
import KhaltiCheckout

/// Bridges the official Khalti Checkout SDK to the Objective-C++ TurboModule.
///
/// One checkout can be open at a time. The completion is invoked exactly once: with the payment
/// result, or with an error code and message when the checkout is closed or fails. When the SDK says
/// the outcome needs confirming, the bridge asks it to verify once before giving up.
@objc(KlixsoftKhaltiBridge)
public final class KlixsoftKhaltiBridge: NSObject {
  public typealias Completion = (NSDictionary?, String?, String?) -> Void

  private var khalti: Khalti?
  private var completion: Completion?
  private var verificationRequested = false

  @objc(payWithPublicKey:pidx:paymentUrl:environment:completion:)
  public func pay(
    publicKey: String,
    pidx: String,
    paymentUrl: String,
    environment: String,
    completion: @escaping Completion
  ) {
    DispatchQueue.main.async { [self] in
      guard !publicKey.isEmpty, !pidx.isEmpty else {
        completion(nil, "E_INVALID_ARGUMENTS", "publicKey and pidx are required.")
        return
      }
      guard self.completion == nil else {
        completion(nil, "E_IN_PROGRESS", "A Khalti checkout is already open.")
        return
      }
      guard let presenter = Self.topViewController() else {
        completion(nil, "E_NO_PRESENTER", "There is no view controller to present the Khalti checkout from.")
        return
      }

      self.completion = completion
      self.verificationRequested = false

      let config = KhaltiPayConfig(
        publicKey: publicKey,
        pIdx: pidx,
        paymentUrl: paymentUrl,
        environment: environment.lowercased() == "production" ? .PROD : .TEST
      )

      let instance = Khalti(
        config: config,
        onPaymentResult: { [weak self] result, khalti in
          self?.handlePaymentResult(result, khalti)
        },
        onMessage: { [weak self] payload, khalti in
          self?.handleMessage(payload, khalti)
        }
      )
      self.khalti = instance
      instance.open(viewController: presenter)
    }
  }

  @objc public func cancel() {
    DispatchQueue.main.async { [self] in
      khalti?.close()
      settle(error: "E_CANCELLED", message: "The Khalti checkout was closed.")
    }
  }

  private func handlePaymentResult(_ result: PaymentResult, _ instance: Khalti?) {
    let done = completion
    completion = nil
    khalti = nil
    (instance ?? khalti)?.close()
    done?(Self.dictionary(from: result), nil, nil)
  }

  private func handleMessage(_ payload: OnMessagePayload, _ instance: Khalti?) {
    if payload.needsPaymentConfirmation && !verificationRequested {
      verificationRequested = true
      instance?.verify()
      return
    }

    let code: String
    switch payload.event {
    case .KPGDisposed: code = "E_CANCELLED"
    case .NetworkFailure: code = "E_NETWORK"
    case .PaymentLookUpFailure: code = "E_LOOKUP_FAILED"
    case .ReturnUrlLoadFailure: code = "E_RETURN_URL"
    case .Unknown: code = "E_UNKNOWN"
    @unknown default: code = "E_UNKNOWN"
    }

    instance?.close()
    settle(error: code, message: payload.message.isEmpty ? "Khalti reported a problem." : payload.message)
  }

  private func settle(error code: String, message: String) {
    let done = completion
    completion = nil
    khalti = nil
    done?(nil, code, message)
  }

  private static func dictionary(from result: PaymentResult) -> NSDictionary {
    var map: [String: Any] = [:]
    if let status = result.status { map["status"] = status }
    if let message = result.message { map["message"] = message }

    if let payload = result.payload {
      if let pidx = payload.pidx { map["pidx"] = pidx }
      map["totalAmount"] = payload.totalAmount
      if let transactionId = payload.transactionId { map["transactionId"] = transactionId }
      map["fee"] = payload.fee
      map["refunded"] = payload.refunded
      if let orderId = payload.purchaseOrderId { map["purchaseOrderId"] = orderId }
      if let orderName = payload.purchaseOrderName { map["purchaseOrderName"] = orderName }
      if let extra = payload.extraMerchantParams { map["extraMerchantParams"] = extra }
    }
    return map as NSDictionary
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
    var controller = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
      ?? scene?.windows.first?.rootViewController
    while let presented = controller?.presentedViewController {
      controller = presented
    }
    return controller
  }
}
