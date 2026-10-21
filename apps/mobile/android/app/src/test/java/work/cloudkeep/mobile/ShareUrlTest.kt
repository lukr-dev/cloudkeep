package work.cloudkeep.mobile

import org.junit.Assert.*
import org.junit.Test

class ShareUrlTest {
    @Test fun extractsFirstLinkFromTextThenSubject() {
        assertEquals("https://example.com/a?b=c", ShareUrl.extract("Read https://example.com/a?b=c then https://other.com", "https://subject.com"))
        assertEquals("https://subject.com", ShareUrl.extract("No link", "https://subject.com"))
        assertNull(ShareUrl.extract(null, null))
    }
    @Test fun trimsProseWithoutBreakingBalancedUrlParentheses() {
        assertEquals("https://example.com/wiki/A_(B)", ShareUrl.extract("See (https://example.com/wiki/A_(B)).", null))
        assertEquals("https://example.com", ShareUrl.extract("Link: <https://example.com>,", null))
        assertEquals("HTTPS://example.com/path", ShareUrl.extract("HTTPS://example.com/path!", null))
    }
    @Test fun rejectsMalformedUrlsAndCredentialsAndSkipsToNextValidLink() {
        assertNull(ShareUrl.extract("javascript:alert(1) ftp://example.com", null))
        assertNull(ShareUrl.extract("https://user:password@example.com", null))
        assertEquals("https://valid.example", ShareUrl.extract("https:///bad https://valid.example", null))
        assertNull(ShareUrl.extract("https://example.com/" + "x".repeat(8000), null))
    }
}
