const { withGradleProperties, withProjectBuildGradle } = require('expo/config-plugins');

// Keep these settings in CNG so Expo prebuild retains them.
module.exports = function withAndroidAiBuild(config) {
  config = withGradleProperties(config, (mod) => {
    const settings = {
      // LiteRT-LM 0.15's Android AAR requires Kotlin 2.3 metadata support.
      // Expo also uses this value to select a compatible KSP version.
      'android.kotlinVersion': '2.3.0',
      'org.gradle.workers.max': '2',
      'org.gradle.parallel': 'false',
    };
    for (const [key, value] of Object.entries(settings)) {
      const existing = mod.modResults.find((entry) => entry.type === 'property' && entry.key === key);
      if (existing) existing.value = value;
      else mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });

  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('ORBIT Android build settings require the Expo Groovy template.');
    }
    const marker = '// ORBIT: limit native compilation on memory-constrained build machines';
    if (!mod.modResults.contents.includes(marker)) {
      // Gradle worker limits alone do not limit Ninja's compiler processes.
      // CMake job pools apply to native targets in the app and its libraries.
      mod.modResults.contents += `

${marker}
subprojects { subproject ->
  ['com.android.application', 'com.android.library'].each { pluginId ->
    subproject.plugins.withId(pluginId) {
      subproject.extensions.getByName('android').defaultConfig.externalNativeBuild.cmake {
        arguments '-DCMAKE_JOB_POOLS=orbit_native=2',
                  '-DCMAKE_JOB_POOL_COMPILE=orbit_native',
                  '-DCMAKE_JOB_POOL_LINK=orbit_native'
      }
    }
  }
}
`;
    }
    return mod;
  });
};
