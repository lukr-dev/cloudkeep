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
    data class Credentials(val server: String, val token: String)
    private var cachedCredentials: Credentials? = null

    @Synchronized fun credentials(): Credentials = cachedCredentials ?: Credentials(
        preferences.getString("server", DEFAULT_SERVER)!!, preferences.getString("token", "")!!
    ).also { cachedCredentials = it }

    @Synchronized fun snapshot(): JSONObject {
        val credentials = credentials()
        return JSONObject().put("server", credentials.server).put("token", credentials.token)
            .put("shareMode", shares.mode).put("defaultList", shares.defaultList)
            .put("pendingUrl", shares.pendingUrl).put("lists", shares.lists)
    }

    @Synchronized fun credentials(server: String, token: String) {
        val normalized = ApiClient.normalizeServer(server)
        val editor = preferences.edit().putString("server", normalized).putString("token", token)
        // Defaults belong to one account, and must never cross an account/server change.
        shares.clearAccount()
        check(editor.commit()) { "Could not store credentials" }
        cachedCredentials = Credentials(normalized, token)
    }
    @Synchronized fun clearCredentials() {
        shares.clearAccount()
        val current = credentials()
        check(preferences.edit().remove("token").commit()) { "Could not clear credentials" }
        cachedCredentials = Credentials(current.server, "")
    }
    @Synchronized fun shareSettings(mode: String, list: String) {
        shares.settings(mode, list)
    }
    @Synchronized fun cacheLists(server: String, token: String, lists: org.json.JSONArray) {
        // A response from a previous account must not repopulate its cleared cache.
        val current = credentials()
        if (server == current.server && token.isNotEmpty() && token == current.token) shares.cache(lists)
    }

    companion object { const val DEFAULT_SERVER = "https://cloudkeep.toastnet.work" }
}
