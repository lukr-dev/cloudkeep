package work.cloudkeep.mobile

import android.app.Application
import com.facebook.drawee.backends.pipeline.Fresco
import com.lynx.service.http.LynxHttpService
import com.lynx.service.image.LynxImageService
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.service.LynxServiceCenter
import java.util.concurrent.Executors

class CloudKeepApplication : Application() {
    val store by lazy { SecureStore(this) }
    private var lynxReady = false
    // Quick save does not initialize or render Lynx.
    @Synchronized fun initializeLynx() {
        if (lynxReady) return
        Fresco.initialize(this)
        LynxServiceCenter.inst().registerService(LynxImageService.getInstance())
        LynxServiceCenter.inst().registerService(LynxHttpService)
        LynxEnv.inst().init(this, null, null, null)
        LynxEnv.inst().registerModule("CloudKeep", CloudKeepModule::class.java)
        lynxReady = true
    }
    companion object { val io = Executors.newFixedThreadPool(3) }
}
