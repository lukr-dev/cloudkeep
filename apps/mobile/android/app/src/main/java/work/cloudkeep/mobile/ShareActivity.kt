package work.cloudkeep.mobile

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

class ShareActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain")
            ShareUrl.extract(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString(), intent.getStringExtra(Intent.EXTRA_SUBJECT)) else null
        if (url == null) {
            Toast.makeText(this, "No HTTP(S) link found", Toast.LENGTH_LONG).show()
            finish()
            return
        }
        // A fresh activity performs exactly one request; configuration changes do not resend it.
        CloudKeepApplication.io.execute {
            try {
                val store = (application as CloudKeepApplication).store
                val state = store.snapshot()
                if (state.getString("shareMode") == "quick" && state.getString("token").isNotEmpty()) {
                    try {
                        val duplicate = ApiClient().save(state.getString("server"), state.getString("token"), url, state.getString("defaultList"))
                        runOnUiThread {
                            Toast.makeText(this, if (duplicate) "Already saved" else "Saved to CloudKeep", Toast.LENGTH_LONG).show()
                            finish()
                        }
                        return@execute
                    } catch (_: Exception) {
                        runOnUiThread { Toast.makeText(this, "Quick save failed. Review and retry in CloudKeep.", Toast.LENGTH_LONG).show() }
                    }
                }
                store.pending(url)
                runOnUiThread {
                    startActivity(Intent(this, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                    finish()
                }
            } catch (_: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Could not access secure storage. Open CloudKeep to sign in again.", Toast.LENGTH_LONG).show()
                    finish()
                }
            }
        }
    }
}
