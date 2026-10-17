package work.cloudkeep.mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.graphics.Color
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.LynxViewClient
import com.lynx.tasm.provider.AbsTemplateProvider
import com.lynx.xelement.XElementBehaviors
import java.lang.ref.WeakReference

class MainActivity : Activity() {
    private var lynxView: LynxView? = null
    private var shareListenerReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ShareTiming.mark("main_create")
        current = WeakReference(this)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView)?.isAppearanceLightStatusBars = true
        val app = application as CloudKeepApplication
        acceptShare(intent)
        app.prepareMain()
        app.initializeLynx()
        render()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        ShareTiming.mark("main_new_intent")
        acceptShare(intent)
        deliverShare()
    }

    private fun acceptShare(intent: Intent) {
        val url = intent.getStringExtra(SHARED_URL) ?: return
        (application as CloudKeepApplication).shares.pending(url)
        // Do not resurrect a completed share when the Activity is recreated.
        intent.removeExtra(SHARED_URL)
    }

    fun frontendReady() {
        shareListenerReady = true
        deliverShare()
    }

    private fun deliverShare() {
        val url = (application as CloudKeepApplication).shares.pendingUrl
        if (shareListenerReady && url.isNotEmpty()) {
            ShareTiming.mark("share_event_sent")
            lynxView?.sendGlobalEvent("cloudkeepShare", JavaOnlyArray.of(url))
        }
    }

    private fun render() {
        val builder = LynxViewBuilder()
        builder.addBehaviors(XElementBehaviors().create())
        builder.setTemplateProvider(object : AbsTemplateProvider() {
            override fun loadTemplate(uri: String, callback: Callback) {
                CloudKeepApplication.io.execute {
                    try {
                        require(uri == "main.lynx.bundle")
                        callback.onSuccess((application as CloudKeepApplication).bundle)
                    } catch (error: Exception) { callback.onFailed(error.message) }
                }
            }
        })
        val view = builder.build(this)
        lynxView = view
        view.addLynxViewClient(object : LynxViewClient() {
            override fun onFirstScreen() { ShareTiming.mark("lynx_first_screen") }
        })
        // Lynx lays out its own children; a native parent must constrain its viewport.
        val container = FrameLayout(this).apply { setBackgroundColor(Color.rgb(250, 250, 250)) }
        container.addView(view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        ViewCompat.setOnApplyWindowInsetsListener(container) { target, insets ->
            val safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or
                WindowInsetsCompat.Type.ime() or WindowInsetsCompat.Type.displayCutout())
            target.setPadding(safe.left, safe.top, safe.right, safe.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(container)
        ViewCompat.requestApplyInsets(container)
        ShareTiming.mark("lynx_render_start")
        view.renderTemplateUrl("main.lynx.bundle", "")
    }

    override fun onResume() { super.onResume(); current = WeakReference(this); lynxView?.onEnterForeground() }
    override fun onPause() { lynxView?.onEnterBackground(); super.onPause() }
    override fun onDestroy() {
        lynxView?.destroy()
        if (current.get() === this) current.clear()
        super.onDestroy()
    }

    companion object {
        const val SHARED_URL = "work.cloudkeep.mobile.SHARED_URL"
        var current = WeakReference<MainActivity>(null)
    }
}
