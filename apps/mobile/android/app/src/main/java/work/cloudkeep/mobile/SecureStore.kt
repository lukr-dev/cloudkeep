package work.cloudkeep.mobile

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

@Suppress("DEPRECATION")
class SecureStore(context: Context) {
    private val preferences = EncryptedSharedPreferences.create(
        context.applicationContext, "cloudkeep",
        MasterKey.Builder(context.applicationContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    val server: String get() = preferences.getString("server", DEFAULT_SERVER)!!
    val token: String get() = preferences.getString("token", "")!!
    val mode: String get() = preferences.getString("shareMode", "ask")!!
    val defaultList: String get() = preferences.getString("defaultList", "")!!
    val pendingUrl: String get() = preferences.getString("pendingUrl", "")!!

    @Synchronized fun snapshot(): JSONObject = JSONObject().put("server", server).put("token", token)
        .put("shareMode", mode).put("defaultList", defaultList).put("pendingUrl", pendingUrl)

    @Synchronized fun credentials(server: String, token: String) {
        val normalized = ApiClient.normalizeServer(server)
        val editor = preferences.edit().putString("server", normalized).putString("token", token)
        // Defaults belong to one account, and must never cross an account/server change.
        editor.remove("defaultList")
        check(editor.commit()) { "Could not store credentials" }
    }
    @Synchronized fun clearCredentials() {
        check(preferences.edit().remove("token").remove("defaultList").commit()) { "Could not clear credentials" }
    }
    @Synchronized fun shareSettings(mode: String, list: String) {
        require(mode in listOf("ask", "quick")) { "Invalid share mode" }
        require(list.isEmpty() || runCatching { java.util.UUID.fromString(list) }.isSuccess) { "Invalid default list" }
        check(preferences.edit().putString("shareMode", mode).putString("defaultList", list).commit()) { "Could not store share settings" }
    }
    @Synchronized fun pending(url: String) { check(preferences.edit().putString("pendingUrl", url).commit()) { "Could not store shared URL" } }

    companion object { const val DEFAULT_SERVER = "https://cloudkeep.toastnet.work" }
}
