package work.cloudkeep.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import org.json.JSONObject

class CloudKeepModule(context: Context) : LynxModule(context) {
    private val app = context.applicationContext as CloudKeepApplication
    private val main = Handler(Looper.getMainLooper())

    @LynxMethod
    fun call(action: String, payload: String, callback: Callback) {
        CloudKeepApplication.io.execute {
            try {
                val args = JSONObject(payload)
                // UI-only actions must not wait for Keystore-backed storage.
                val store by lazy { app.store }
                val result: Any = when (action) {
                    "getState" -> {
                        ShareTiming.mark("state_read_start")
                        store.snapshot().also { ShareTiming.mark("state_read_ready") }
                    }
                    "setCredentials" -> { store.credentials(args.getString("server"), args.getString("token")); true }
                    "clearCredentials" -> { store.clearCredentials(); true }
                    "setShareSettings" -> { store.shareSettings(args.getString("shareMode"), args.getString("defaultList")); true }
                    "cacheLists" -> { store.cacheLists(args.getString("server"), args.getString("token"), args.getJSONArray("lists")); true }
                    "getPendingSharedUrl" -> app.shares.pendingUrl
                    "clearPendingSharedUrl" -> { app.shares.pending(""); true }
                    "frontendReady" -> { main.post { MainActivity.current.get()?.frontendReady() }; true }
                    "markTiming" -> {
                        val phase = args.getString("phase")
                        require(phase in listOf("js_state_ready", "js_picker_committed", "lists_loaded"))
                        ShareTiming.mark(phase)
                        true
                    }
                    "request" -> {
                        val credentials = store.credentials()
                        ApiClient().request(credentials.server, credentials.token, args.getString("path"), args.optString("method", "GET"), if (args.has("body")) args.getString("body") else null)
                    }
                    "openUrl" -> {
                        val url = args.getString("url")
                        require(Uri.parse(url).scheme in listOf("https", "http")) { "Only HTTP(S) links can be opened" }
                        main.post {
                            try { app.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                            catch (_: Exception) { Toast.makeText(app, "No browser available", Toast.LENGTH_LONG).show() }
                        }
                        true
                    }
                    "toast" -> { main.post { Toast.makeText(app, args.getString("message"), Toast.LENGTH_LONG).show() }; true }
                    "setBackHandler" -> {
                        val enabled = args.getBoolean("enabled")
                        main.post { MainActivity.current.get()?.backHandler = enabled }
                        true
                    }
                    "finishShare" -> { main.post { MainActivity.current.get()?.moveTaskToBack(true) }; true }
                    else -> error("Unknown native action")
                }
                callback.invoke(JSONObject().put("value", result).toString())
            } catch (error: Exception) {
                callback.invoke(JSONObject().put("error", error.message ?: "Native operation failed").toString())
            }
        }
    }
}
