package work.cloudkeep.mobile

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

@Suppress("DEPRECATION")
class SecureStore(context: Context, private val shares: ShareStore) {
    private val preferences = EncryptedSharedPreferences.create(
        context.applicationContext, "cloudkeep",
        MasterKey.Builder(context.applicationContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    init {
        shares.migrate(preferences.getString("shareMode", "ask")!!,
            preferences.getString("defaultList", "")!!, preferences.getString("pendingUrl", "")!!)
        preferences.edit().remove("shareMode").remove("defaultList").remove("pendingUrl").apply()
    }
    val server: String get() = preferences.getString("server", DEFAULT_SERVER)!!
    val token: String get() = preferences.getString("token", "")!!

    @Synchronized fun snapshot(): JSONObject = JSONObject().put("server", server).put("token", token)
        .put("shareMode", shares.mode).put("defaultList", shares.defaultList)
        .put("pendingUrl", shares.pendingUrl).put("lists", shares.lists)

    @Synchronized fun credentials(server: String, token: String) {
        val normalized = ApiClient.normalizeServer(server)
        val editor = preferences.edit().putString("server", normalized).putString("token", token)
        // Defaults belong to one account, and must never cross an account/server change.
        shares.clearAccount()
        check(editor.commit()) { "Could not store credentials" }
    }
    @Synchronized fun clearCredentials() {
        shares.clearAccount()
        check(preferences.edit().remove("token").commit()) { "Could not clear credentials" }
    }
    @Synchronized fun shareSettings(mode: String, list: String) {
        shares.settings(mode, list)
    }
    @Synchronized fun cacheLists(server: String, token: String, lists: org.json.JSONArray) {
        // A response from a previous account must not repopulate its cleared cache.
        if (server == this.server && token.isNotEmpty() && token == this.token) shares.cache(lists)
    }

    companion object { const val DEFAULT_SERVER = "https://cloudkeep.toastnet.work" }
}
