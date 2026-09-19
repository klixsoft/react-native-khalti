import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Opens the official Khalti checkout for an already-initiated payment and resolves with the
   * payment result. Rejects with a `code` (see `KhaltiErrorCode`) when the checkout is closed,
   * fails, or cannot be started.
   */
  pay(
    publicKey: string,
    pidx: string,
    paymentUrl: string,
    environment: string,
    openInKhalti: boolean
  ): Promise<Object>;

  /** Closes the checkout if it is open. The pending `pay` call rejects with `E_CANCELLED`. */
  cancel(): void;
}

export default TurboModuleRegistry.get<Spec>('KlixsoftKhalti');
