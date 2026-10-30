package work.cloudkeep.mobile

import android.app.Application
import com.facebook.drawee.backends.pipeline.Fresco
import com.lynx.service.http.LynxHttpService
import com.lynx.service.image.LynxImageService
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.service.LynxServiceCenter
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class CloudKeepApplication : Application() {
    val bookmarksChanged = AtomicBoolean(false)
    val shares by lazy { ShareStore(this) }
    val store by lazy {
        ShareTiming.mark("secure_store_start")
        SecureStore(this, shares).also { ShareTiming.mark("secure_store_ready") }
    }
    val bundle: ByteArray by lazy {
        ShareTiming.mark("bundle_read_start")
        assets.open("main.lynx.bundle").use { it.readBytes() }.also { ShareTiming.mark("bundle_read_ready") }
    }

    override fun onCreate() {
        super.onCreate()
        ShareTiming.mark("application_create")
    }

    fun prepareMain() {
        // Overlap disk/Keystore with main-thread Lynx initialization, only on the Ask/app path.
        io.execute { runCatching { bundle } }
        io.execute { runCatching { store } }
    }
    private var lynxReady = false
    // Quick save does not initialize or render Lynx.
    @Synchronized fun initializeLynx() {
        if (lynxReady) return
        ShareTiming.mark("lynx_init_start")
        Fresco.initialize(this)
        LynxServiceCenter.inst().registerService(LynxImageService.getInstance())
        LynxServiceCenter.inst().registerService(LynxHttpService)
        LynxEnv.inst().init(this, null, null, null)
        LynxEnv.inst().registerModule("CloudKeep", CloudKeepModule::class.java)
        lynxReady = true
        ShareTiming.mark("lynx_init_ready")
    }
    companion object { val io = Executors.newFixedThreadPool(3) }
}
