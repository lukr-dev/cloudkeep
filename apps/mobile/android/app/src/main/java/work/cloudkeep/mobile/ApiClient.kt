package work.cloudkeep.mobile

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.util.concurrent.TimeUnit

class ApiClient {
    fun request(server: String, token: String, path: String, method: String, body: String?): JSONObject {
        require(path.startsWith("/api/") && !path.contains("..") && !path.contains('\\') && !path.contains('#')) { "Invalid API path" }
        require(method in listOf("GET", "POST", "PATCH", "PUT", "DELETE")) { "Invalid method" }
        val base = normalizeServer(server)
        val builder = Request.Builder().url(base + path).header("Accept", "application/json")
        if (token.isNotEmpty()) builder.header("Authorization", "Bearer $token")
        val payload = if (method in listOf("POST", "PATCH", "PUT")) (body ?: "{}").toRequestBody("application/json".toMediaType()) else null
        client.newCall(builder.method(method, payload).build()).execute().use { response ->
            return JSONObject().put("status", response.code)
                .put("body", response.body?.string().orEmpty())
                .put("token", response.header("set-auth-token").orEmpty())
        }
    }

    fun save(server: String, token: String, url: String, defaultList: String): Boolean {
        require(token.isNotEmpty()) { "Sign in to save this link" }
        val body = JSONObject().put("url", url).put("listIds", JSONArray().apply { if (defaultList.isNotEmpty()) put(defaultList) })
        val response = request(server, token, "/api/bookmarks", "POST", body.toString())
        check(response.getInt("status") in 200..299) { "Could not save. Open CloudKeep to retry." }
        return JSONObject(response.getString("body")).getBoolean("alreadyExists")
    }

    companion object {
        // Never forward a bearer token to a redirect target, including another origin.
        private val client = OkHttpClient.Builder()
            .followRedirects(false).followSslRedirects(false)
            .callTimeout(20, TimeUnit.SECONDS).build()

        fun normalizeServer(value: String): String {
            val uri = URI(value.trim().trimEnd('/'))
            require(uri.scheme in listOf("http", "https") && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.rawQuery == null && uri.rawFragment == null && uri.path.orEmpty().isEmpty()) { "Use a server origin, for example https://cloudkeep.toastnet.work" }
            return uri.toString()
        }
    }
}
