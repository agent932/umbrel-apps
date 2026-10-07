import UIKit
import Capacitor
import StoreKit

/// The app's web view, plus the app's own small native plugins.
class AppBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ReviewPromptPlugin())
    }
}

/// Apple's "Enjoying Deckhand Games?" rating prompt. The web code decides when to ask
/// (apps/web/src/rating.ts); Apple decides whether it actually shows (at most 3 times a year).
@objc(ReviewPromptPlugin)
public class ReviewPromptPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReviewPromptPlugin"
    public let jsName = "ReviewPrompt"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
    ]

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let scene = UIApplication.shared.connectedScenes
                .first { $0.activationState == .foregroundActive } as? UIWindowScene
            if let scene {
                if #available(iOS 16.0, *) {
                    AppStore.requestReview(in: scene)
                } else {
                    SKStoreReviewController.requestReview(in: scene)
                }
            }
            call.resolve()
        }
    }
}
