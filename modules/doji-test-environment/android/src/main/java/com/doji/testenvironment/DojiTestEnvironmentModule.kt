package com.doji.testenvironment

import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Passive attribution only. Never use this untrusted marker for authorization or error suppression. */
class DojiTestEnvironmentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DojiTestEnvironment")
    Constants {
      val status = try {
        val resolver = appContext.reactContext?.contentResolver
        if (resolver == null) "unknown" else when (Settings.System.getString(resolver, "firebase.test.lab")) {
          "true" -> "detected"
          null, "false" -> "not_detected"
          else -> "unknown"
        }
      } catch (_: RuntimeException) {
        "unknown"
      }
      mapOf("firebaseTestLab" to status)
    }
  }
}
