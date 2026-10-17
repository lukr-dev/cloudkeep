package work.cloudkeep.mobile

import java.net.URI

object ShareUrl {
    fun extract(text: String?, subject: String?): String? {
        for (source in listOfNotNull(text, subject)) {
            for (match in Regex("https?://[^\\s<>\\\"\\u0000-\\u001f]+", RegexOption.IGNORE_CASE).findAll(source)) {
                var candidate = match.value.trimEnd('.', ',', ';', ':', '!', '?', '\'', '”', '’')
                for ((open, close) in listOf('(' to ')', '[' to ']', '{' to '}')) {
                    while (candidate.endsWith(close) && candidate.count { it == close } > candidate.count { it == open }) {
                        candidate = candidate.dropLast(1)
                    }
                }
                val uri = runCatching { URI(candidate) }.getOrNull() ?: continue
                if (!uri.host.isNullOrBlank() && uri.userInfo == null && candidate.length <= 8000) return candidate
            }
        }
        return null
    }
}
