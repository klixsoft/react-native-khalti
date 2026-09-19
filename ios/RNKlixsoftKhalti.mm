#import "RNKlixsoftKhalti.h"

#if __has_include("RNKlixsoftKhalti/RNKlixsoftKhalti-Swift.h")
#import "RNKlixsoftKhalti/RNKlixsoftKhalti-Swift.h"
#else
#import "RNKlixsoftKhalti-Swift.h"
#endif

@implementation RNKlixsoftKhalti {
  KlixsoftKhaltiBridge *_bridge;
}

RCT_EXPORT_MODULE(KlixsoftKhalti)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if (self = [super init]) {
    _bridge = [KlixsoftKhaltiBridge new];
  }
  return self;
}

- (void)pay:(NSString *)publicKey
        pidx:(NSString *)pidx
    paymentUrl:(NSString *)paymentUrl
   environment:(NSString *)environment
  openInKhalti:(BOOL)openInKhalti
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject
{
  [_bridge payWithPublicKey:publicKey
                       pidx:pidx
                 paymentUrl:paymentUrl
                environment:environment
                 completion:^(NSDictionary *result, NSString *errorCode, NSString *errorMessage) {
                   if (errorCode != nil) {
                     reject(errorCode, errorMessage, nil);
                   } else {
                     resolve(result);
                   }
                 }];
}

- (void)cancel
{
  [_bridge cancel];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeKhaltiSpecJSI>(params);
}

@end
