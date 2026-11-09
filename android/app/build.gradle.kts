import java.util.Properties

plugins {
    id("com.android.application")
    id("com.android.legacy-kapt")
    id("org.jetbrains.kotlin.plugin.compose")
}

val adblockJniLibs = layout.buildDirectory.dir("generated/adblock-jni")

val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localPropertiesFile.inputStream().use { localProperties.load(it) }
}
android {
    namespace = "com.workrcs.situla"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.workrcs.situla"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_BASE_URL", "\"" + localProperties.getProperty("situlaApiBaseUrl", "") + "\"")
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    sourceSets.getByName("main").jniLibs.srcDir(adblockJniLibs.get().asFile)
    packaging { resources { excludes += setOf("/META-INF/AL2.0", "/META-INF/LGPL2.1") } }
}
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}
dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.10.00")
    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation("com.wireguard.android:tunnel:1.0.20260102")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-process:2.9.4")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.room:room-runtime:2.8.5")
    implementation("androidx.room:room-ktx:2.8.5")
    kapt("androidx.room:room-compiler:2.8.5")
    implementation("androidx.media3:media3-exoplayer:1.9.0")
    implementation("androidx.media3:media3-exoplayer-hls:1.9.0")
    implementation("androidx.media3:media3-ui:1.9.0")
}


val nativeAbis = (findProperty("situlaAndroidAbis") as String?)
    ?.split(",")
    ?.map { it.trim() }
    ?.filter { it.isNotEmpty() }
    ?: listOf("x86_64") // Fast default for the standard Windows Android Emulator.

val buildBraveAdblock by tasks.registering(org.gradle.api.tasks.Exec::class) {
    group = "build"
    description = "Compile Brave adblock-rust JNI library for the selected Android ABI(s)."
    workingDir(rootProject.file("adblock-rust"))
    inputs.dir(rootProject.file("adblock-rust"))
    inputs.property("situlaAndroidAbis", nativeAbis.joinToString(","))
    outputs.dir(adblockJniLibs)
    environment("CARGO_TARGET_DIR", layout.buildDirectory.dir("rust-target").get().asFile.absolutePath)
    val arguments = mutableListOf("cargo", "ndk")
    nativeAbis.forEach { abi ->
        arguments.add("-t")
        arguments.add(abi)
    }
    arguments.addAll(listOf("-o", adblockJniLibs.get().asFile.absolutePath, "build", "--release"))
    commandLine(arguments)
}

tasks.named("preBuild").configure {
    dependsOn(buildBraveAdblock)
}
