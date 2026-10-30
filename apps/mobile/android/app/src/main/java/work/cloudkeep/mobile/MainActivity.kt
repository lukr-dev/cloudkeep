package work.cloudkeep.mobile

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.os.SystemClock
import android.graphics.Color
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.tasm.LynxColorScheme
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.LynxViewClient
import com.lynx.tasm.provider.AbsTemplateProvider
import com.lynx.xelement.XElementBehaviors
import java.lang.ref.WeakReference

class MainActivity : Activity() {
    private var lynxView: LynxView? = null
    private var container: FrameLayout? = null
    private var shareListenerReady = false
    private var dark = false
    private var pausedAt: Long? = null
    /** Set by the frontend while Back should navigate inside the app instead of leaving it. */
    var backHandler = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ShareTiming.mark("main_create")
        current = WeakReference(this)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        dark = isDark(resources.configuration)
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

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // uiMode is handled here so a system theme switch keeps the current screen and share state.
        val next = isDark(newConfig)
        if (next == dark) return
        dark = next
        applyTheme()
        lynxView?.apply {
            updateColorScheme(colorScheme())
            updateGlobalProps(globalProps())
            sendGlobalEvent("cloudkeepTheme", JavaOnlyArray.of(scheme()))
        }
    }

    @Deprecated("Back is routed to the frontend while it has somewhere to go back to.")
    override fun onBackPressed() {
        val view = lynxView
        if (backHandler && shareListenerReady && view != null) view.sendGlobalEvent("cloudkeepBack", JavaOnlyArray())
        else @Suppress("DEPRECATION") super.onBackPressed()
    }

    private fun isDark(config: Configuration) =
        config.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    private fun scheme() = if (dark) "dark" else "light"
    private fun colorScheme() = if (dark) LynxColorScheme.DARK else LynxColorScheme.LIGHT
    private fun globalProps(): Map<String, Any> = mapOf("colorScheme" to scheme())

    // System bars are transparent; the inset container's background fills the areas behind them.
    private fun applyTheme() {
        container?.setBackgroundColor(if (dark) Color.rgb(17, 17, 19) else Color.rgb(250, 250, 250))
        WindowCompat.getInsetsController(window, window.decorView)?.apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
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
        builder.setColorScheme(colorScheme())
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
        // Read synchronously by the frontend as lynx.__globalProps.colorScheme, avoiding a light flash.
        view.setGlobalProps(globalProps())
        view.addLynxViewClient(object : LynxViewClient() {
            override fun onFirstScreen() { ShareTiming.mark("lynx_first_screen") }
        })
        // Lynx lays out its own children; a native parent must constrain its viewport.
        val container = FrameLayout(this).also { container = it }
        applyTheme()
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

    override fun onResume() {
        super.onResume()
        current = WeakReference(this)
        lynxView?.onEnterForeground()
        if (shareListenerReady) {
            // Deliver the picker first so background refreshes wait until the share is finished.
            deliverShare()
            val elapsed = pausedAt?.let { SystemClock.elapsedRealtime() - it } ?: 0L
            val changed = (application as CloudKeepApplication).bookmarksChanged.getAndSet(false)
            lynxView?.sendGlobalEvent("cloudkeepResume", JavaOnlyArray.of(elapsed.toDouble(), changed))
        }
        pausedAt = null
    }
    override fun onPause() {
        pausedAt = SystemClock.elapsedRealtime()
        lynxView?.onEnterBackground()
        super.onPause()
    }
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
