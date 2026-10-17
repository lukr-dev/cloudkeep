package work.cloudkeep.mobile

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ApiClientTest {
    @Test fun savesWithBearerAndOptionalListWithoutOriginOrCookie() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(201).setBody("{\"alreadyExists\":false}"))
            assertFalse(ApiClient().save(server.url("/").toString(), "secret", "https://example.com", "list-id"))
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/bookmarks", request.path)
            assertEquals("Bearer secret", request.getHeader("Authorization"))
            assertNull(request.getHeader("Origin"))
            assertNull(request.getHeader("Cookie"))
            val body = JSONObject(request.body.readUtf8())
            assertEquals("https://example.com", body.getString("url"))
            assertEquals("list-id", body.getJSONArray("listIds").getString(0))
        }
    }
    @Test fun reportsDuplicateAndNoList() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("{\"alreadyExists\":true}"))
            assertTrue(ApiClient().save(server.url("/").toString(), "token", "https://example.com", ""))
            assertEquals(0, JSONObject(server.takeRequest().body.readUtf8()).getJSONArray("listIds").length())
        }
    }
    @Test fun doesNotFollowRedirectsOrLeakToken() {
        MockWebServer().use { server ->
            MockWebServer().use { other ->
                server.enqueue(MockResponse().setResponseCode(302).setHeader("Location", other.url("/api/bookmarks")))
                val response = ApiClient().request(server.url("/").toString(), "secret", "/api/bookmarks", "GET", null)
                assertEquals(302, response.getInt("status"))
                assertEquals(0, other.requestCount)
            }
        }
    }
    @Test fun readsBetterAuthHeaderAndTreatsErrorsAsFailedSaves() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setHeader("set-auth-token", "new-session").setBody("{}"))
            assertEquals("new-session", ApiClient().request(server.url("/").toString(), "", "/api/auth/sign-in/email", "POST", "{}").getString("token"))
            for (status in listOf(401, 404, 500)) {
                server.enqueue(MockResponse().setResponseCode(status).setBody("{}"))
                assertTrue(runCatching { ApiClient().save(server.url("/").toString(), "token", "https://example.com", "") }.isFailure)
            }
        }
    }
    @Test fun rejectsNonOriginsAndEscapingApiPaths() {
        for (server in listOf("file:///tmp", "https://user:pass@example.com", "https://example.com/api", "https://example.com?x=1")) {
            assertTrue(runCatching { ApiClient.normalizeServer(server) }.isFailure)
        }
        assertTrue(runCatching { ApiClient().request("https://example.com", "token", "//evil.example", "GET", null) }.isFailure)
        assertTrue(runCatching { ApiClient().request("https://example.com", "token", "/api/../other", "GET", null) }.isFailure)
    }
}
