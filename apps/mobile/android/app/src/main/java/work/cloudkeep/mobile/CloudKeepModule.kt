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
                val store = app.store
                val result: Any = when (action) {
                    "getState" -> store.snapshot()
                    "setCredentials" -> { store.credentials(args.getString("server"), args.getString("token")); true }
                    "clearCredentials" -> { store.clearCredentials(); true }
                    "setShareSettings" -> { store.shareSettings(args.getString("shareMode"), args.getString("defaultList")); true }
                    "getPendingSharedUrl" -> store.pendingUrl
                    "clearPendingSharedUrl" -> { store.pending(""); true }
                    "request" -> {
                        val state = store.snapshot()
                        ApiClient().request(state.getString("server"), state.getString("token"), args.getString("path"), args.optString("method", "GET"), if (args.has("body")) args.getString("body") else null)
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
