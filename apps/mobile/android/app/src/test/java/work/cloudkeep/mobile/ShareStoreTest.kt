package work.cloudkeep.mobile

import android.content.SharedPreferences
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Proxy

class ShareStoreTest {
    private val list = """[{"id":"list-1","name":"Reading 📚","count":2,"createdAt":1,"updatedAt":2}]"""

    @Test fun cacheRoundTripsAndCorruptionIsACacheMiss() {
        val parsed = ListCache.parse(list)
        assertEquals("Reading 📚", parsed.getJSONObject(0).getString("name"))
        assertEquals(2, parsed.getJSONObject(0).getInt("count"))
        for (raw in listOf("", "null", "{}", "[null]", "[{}]", list.replace("list-1", ""), list.dropLast(1))) {
            assertEquals(raw, 0, ListCache.parse(raw).length())
        }
        assertEquals(0, ListCache.parse("[]").length())
    }

    @Test fun freshInstallDefaultsToAskAndLegacyQuickMigratesOnlyOnce() {
        val preferences = preferences()
        val legacy = preferences(mutableMapOf("encrypted-key" to "ciphertext"))
        val shares = ShareStore(preferences, legacy)
        assertEquals("ask", shares.mode)
        assertTrue(shares.needsMigration)
        shares.migrate("quick", "old-list", "https://old.example")
        assertEquals("quick", shares.mode)
        assertEquals("old-list", shares.defaultList)
        assertEquals("https://old.example", shares.pendingUrl)
        assertFalse(shares.needsMigration)
        shares.settings("ask", "")
        shares.migrate("quick", "old-list", "https://old.example")
        assertEquals("ask", shares.mode)
        assertEquals("", shares.defaultList)
        assertFalse(ShareStore(preferences(), preferences()).needsMigration)
    }

    @Test fun incomingShareWinsMigrationAndClearingPreventsResurrectingLegacyUrl() {
        val shares = ShareStore(preferences(), preferences())
        shares.pending("https://new.example")
        shares.migrate("ask", "", "https://old.example")
        assertEquals("https://new.example", shares.pendingUrl)
        shares.pending("")
        shares.migrate("ask", "", "https://old.example")
        assertEquals("", shares.pendingUrl)
    }

    @Test fun accountResetDropsListCacheAndDefaultButPreservesShareAndMode() {
        val shares = ShareStore(preferences(), preferences())
        shares.settings("quick", "00000000-0000-0000-0000-000000000001")
        shares.pending("https://example.com")
        shares.cache(JSONArray(list))
        assertEquals(1, shares.lists.length())
        shares.clearAccount()
        assertEquals(0, shares.lists.length())
        assertEquals("", shares.defaultList)
        assertEquals("quick", shares.mode)
        assertEquals("https://example.com", shares.pendingUrl)
        assertTrue(runCatching { shares.settings("invalid", "") }.isFailure)
        assertTrue(runCatching { shares.settings("quick", "invalid-list") }.isFailure)
    }

    // JVM tests need only Android's interfaces, not a device or a mocked Keystore.
    private fun preferences(values: MutableMap<String, String> = mutableMapOf()): SharedPreferences {
        val changes = mutableMapOf<String, String?>()
        val editor = Proxy.newProxyInstance(SharedPreferences.Editor::class.java.classLoader,
            arrayOf(SharedPreferences.Editor::class.java)) { proxy, method, args ->
            when (method.name) {
                "putString" -> { changes[args!![0] as String] = args[1] as String?; proxy }
                "remove" -> { changes[args!![0] as String] = null; proxy }
                "commit", "apply" -> {
                    for ((key, value) in changes) if (value == null) values.remove(key) else values[key] = value
                    changes.clear()
                    if (method.name == "commit") true else null
                }
                else -> error("Unexpected editor method ${method.name}")
            }
        } as SharedPreferences.Editor
        return Proxy.newProxyInstance(SharedPreferences::class.java.classLoader,
            arrayOf(SharedPreferences::class.java)) { _, method, args ->
            when (method.name) {
                "getString" -> values[args!![0]] ?: args[1]
                "contains" -> values.containsKey(args!![0])
                "getAll" -> values.toMap()
                "edit" -> editor
                else -> error("Unexpected preferences method ${method.name}")
            }
        } as SharedPreferences
    }
}
