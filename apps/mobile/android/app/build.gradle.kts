plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val signingValues = listOf("ANDROID_KEYSTORE_PATH", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD")
val canSign = signingValues.all { !System.getenv(it).isNullOrBlank() }

android {
    namespace = "work.cloudkeep.mobile"
    compileSdk = 35
    defaultConfig {
        applicationId = "work.cloudkeep.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = providers.gradleProperty("versionCode").orElse("1").get().toInt()
        versionName = providers.gradleProperty("versionName").orElse("0.1.0").get()
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }
    signingConfigs {
        if (canSign) create("release") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (canSign) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/lynxAssets"))
}

val bundleMobile by tasks.registering(Exec::class) {
    workingDir = file("../../../..")
    commandLine("vp", "run", "mobile#build")
    inputs.dir("../../src")
    inputs.file("../../lynx.config.ts")
    inputs.file("../../package.json")
    inputs.file("../../../../pnpm-lock.yaml")
    outputs.dir("../../dist")
}
val copyLynxBundle by tasks.registering(Sync::class) {
    dependsOn(bundleMobile)
    from("../../dist") { include("main.lynx.bundle") }
    into(layout.buildDirectory.dir("generated/lynxAssets"))
    doLast { check(file("../../dist/main.lynx.bundle").isFile) { "Missing main.lynx.bundle; run vp run mobile#build" } }
}
tasks.named("preBuild") { dependsOn(copyLynxBundle) }
tasks.configureEach {
    if (name == "preReleaseBuild") doFirst {
        check(canSign) { "Release signing requires ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD. Refusing an unsigned release." }
    }
}

dependencies {
    val lynx = "4.1.0"
    implementation("org.lynxsdk.lynx:lynx:$lynx")
    implementation("org.lynxsdk.lynx:lynx-jssdk:$lynx")
    implementation("org.lynxsdk.lynx:lynx-trace:$lynx")
    implementation("org.lynxsdk.lynx:primjs:4.1.1")
    implementation("org.lynxsdk.lynx:lynx-service-http:$lynx")
    implementation("org.lynxsdk.lynx:lynx-service-image:$lynx")
    implementation("org.lynxsdk.lynx:xelement:$lynx")
    implementation("org.lynxsdk.lynx:xelement-input:$lynx")
    implementation("org.lynxsdk.lynx:xelement-refresh:$lynx")
    implementation("androidx.viewpager2:viewpager2:1.1.0")
    implementation("androidx.core:core:1.7.0")
    implementation("com.facebook.fresco:fresco:2.3.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.security:security-crypto:1.1.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.json:json:20240303")
}
