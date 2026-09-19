package com.klixsoft.khalti;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.util.HashMap;
import java.util.Map;

/** Registers {@link KhaltiModule} with React Native. Autolinking adds this package for you. */
public class KhaltiPackage extends BaseReactPackage {

  @Nullable
  @Override
  public NativeModule getModule(@NonNull String name, @NonNull ReactApplicationContext reactContext) {
    if (KhaltiModule.NAME.equals(name)) {
      return new KhaltiModule(reactContext);
    }
    return null;
  }

  @NonNull
  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return () -> {
      final Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
      moduleInfos.put(
        KhaltiModule.NAME,
        new ReactModuleInfo(KhaltiModule.NAME, KhaltiModule.class.getName(), false, false, false, true)
      );
      return moduleInfos;
    };
  }
}
