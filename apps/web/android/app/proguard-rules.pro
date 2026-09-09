# Capacitor bridges JavaScript to native code by reflection, so the plugin
# classes and their annotated methods must survive shrinking. Without these,
# a release build starts fine and then fails the moment the page asks for
# location — the worst kind of bug, because debug builds never show it.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Plugins used by this app.
-keep class com.capacitorjs.plugins.** { *; }

# The WebView calls into these from JavaScript.
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Readable stack traces from Play Console crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
