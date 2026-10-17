package work.cloudkeep.mobile

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

// Non-secret settings/cache must be readable without opening Android Keystore.
class ShareStore(private val preferences: SharedPreferences, private val legacy: SharedPreferences) {
    constructor(context: Context) : this(
        context.getSharedPreferences("cloudkeep-share", Context.MODE_PRIVATE),
        context.getSharedPreferences("cloudkeep", Context.MODE_PRIVATE)
    )
    val needsMigration: Boolean get() = !preferences.contains("shareMode") && legacy.all.isNotEmpty()
    val mode: String get() = preferences.getString("shareMode", "ask")!!
    val defaultList: String get() = preferences.getString("defaultList", "")!!
    val pendingUrl: String get() = preferences.getString("pendingUrl", "")!!
    val lists: JSONArray get() = ListCache.parse(preferences.getString("lists", "[]")!!)

    fun migrate(mode: String, defaultList: String, pendingUrl: String) {
        if (preferences.contains("shareMode")) return
        val editor = preferences.edit().putString("shareMode", mode).putString("defaultList", defaultList)
        // A newly received intent takes precedence over a legacy pending share.
        if (!preferences.contains("pendingUrl")) editor.putString("pendingUrl", pendingUrl)
        check(editor.commit()) { "Could not migrate share settings" }
    }

    fun settings(mode: String, list: String) {
        require(mode in listOf("ask", "quick")) { "Invalid share mode" }
        require(list.isEmpty() || runCatching { java.util.UUID.fromString(list) }.isSuccess) { "Invalid default list" }
        check(preferences.edit().putString("shareMode", mode).putString("defaultList", list).commit()) { "Could not store share settings" }
    }

    fun clearAccount() {
        check(preferences.edit().remove("defaultList").remove("lists").commit()) { "Could not clear account cache" }
    }

    fun cache(lists: JSONArray) { preferences.edit().putString("lists", ListCache.parse(lists.toString()).toString()).apply() }
    fun pending(url: String) { preferences.edit().putString("pendingUrl", url).apply() }
}

object ListCache {
    // Corruption or an obsolete shape is a cache miss; never block opening the picker.
    fun parse(raw: String): JSONArray = runCatching {
        val source = JSONArray(raw)
        JSONArray().apply {
            for (index in 0 until source.length()) {
                val item = source.getJSONObject(index)
                val id = item.getString("id")
                val name = item.getString("name")
                require(id.isNotBlank() && name.isNotBlank())
                put(JSONObject().put("id", id).put("name", name)
                    .put("count", item.getInt("count"))
                    .put("createdAt", item.getLong("createdAt"))
                    .put("updatedAt", item.getLong("updatedAt")))
            }
        }
    }.getOrElse { JSONArray() }
}
