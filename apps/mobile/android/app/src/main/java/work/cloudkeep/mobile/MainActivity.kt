package work.cloudkeep.mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.provider.AbsTemplateProvider
import com.lynx.xelement.XElementBehaviors
import java.lang.ref.WeakReference

class MainActivity : Activity() {
    private var lynxView: LynxView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        current = WeakReference(this)
        (application as CloudKeepApplication).initializeLynx()
        render()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Reload from encrypted pending state even when an existing task receives a share.
        render()
    }

    private fun render() {
        lynxView?.destroy()
        val builder = LynxViewBuilder()
        builder.addBehaviors(XElementBehaviors().create())
        builder.setTemplateProvider(object : AbsTemplateProvider() {
            override fun loadTemplate(uri: String, callback: Callback) {
                CloudKeepApplication.io.execute {
                    try {
                        require(uri == "main.lynx.bundle")
                        callback.onSuccess(assets.open(uri).use { it.readBytes() })
                    } catch (error: Exception) { callback.onFailed(error.message) }
                }
            }
        })
        val view = builder.build(this)
        lynxView = view
        // Android 15 enforces edge-to-edge: keep inputs/navigation clear of system bars and IME.
        view.setOnApplyWindowInsetsListener { target, insets ->
            target.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        setContentView(view)
        view.requestApplyInsets()
        view.renderTemplateUrl("main.lynx.bundle", "")
    }

    override fun onResume() { super.onResume(); current = WeakReference(this); lynxView?.onEnterForeground() }
    override fun onPause() { lynxView?.onEnterBackground(); super.onPause() }
    override fun onDestroy() {
        lynxView?.destroy()
        if (current.get() === this) current.clear()
        super.onDestroy()
    }

    companion object { var current = WeakReference<MainActivity>(null) }
}
