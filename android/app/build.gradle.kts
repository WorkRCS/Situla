import java.util.Properties

plugins {
    id("com.android.application")
    id("com.android.legacy-kapt")
    id("org.jetbrains.kotlin.plugin.compose")
}

val braveAdblockAar = configurations.create("braveAdblockAar") {
    isCanBeConsumed = false
    isCanBeResolved = true
    isTransitive = false
}

val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localPropertiesFile.inputStream().use { localProperties.load(it) }
}
val braveAdblockOutput = layout.buildDirectory.dir("generated/braveAdblock")

android {
    namespace = "com.workrcs.situla"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.workrcs.situla"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["situlaApiBaseUrl"] = localProperties.getProperty("situlaApiBaseUrl", "https://situla-five.vercel.app/")
    }
    buildFeatures { compose = true; buildConfig = false }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    packaging { resources { excludes += setOf("/META-INF/AL2.0", "/META-INF/LGPL2.1") } }
    sourceSets.getByName("main") {
        jniLibs.srcDir(braveAdblockOutput.get().dir("jniLibs").asFile)
        assets.srcDir(braveAdblockOutput.get().dir("assets").asFile)
    }
}
val extractBraveAdblockAar = tasks.register<Copy>("extractBraveAdblockAar") {
    into(braveAdblockOutput.get().asFile)
    from({ braveAdblockAar.files.map { zipTree(it) } }) {
        include("jni/**/*.so")
        eachFile { path = path.removePrefix("jni/") }
        into("jniLibs")
    }
    from({ braveAdblockAar.files.map { zipTree(it) } }) {
        include("assets/adblock/resources.json")
        eachFile { path = path.removePrefix("assets/") }
        into("assets")
    }
    includeEmptyDirs = false
}

tasks.named("preBuild").configure {
    dependsOn(extractBraveAdblockAar)
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}
dependencies {
    add(braveAdblockAar.name, "io.github.mlm-games:adblock:0.1.3@aar")
    val composeBom = platform("androidx.compose:compose-bom:2025.10.00")
    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-process:2.9.4")
    implementation("com.wireguard.android:tunnel:1.0.20260102")
    // The AAR is resolved only as a file below to consume its JNI binaries/assets.
    // Kotlin bridge sources are vendored under src/main/java so compileSdk 36 is supported.
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
