import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';

// Production: the app is served by PocketBase itself, so the API is same-origin.
// Dev: set PUBLIC_POCKETBASE_URL to the local PocketBase.
export const pb = new PocketBase(env.PUBLIC_POCKETBASE_URL || '/');

// A home server that is unreachable can leave a request hanging instead of
// failing (captive wifi, Tailscale down). The timeout rejects with a
// TimeoutError, which the SDK reports as status 0 (not an abort), so callers
// treat it like any other network error and fall back to the offline cache.
const REQUEST_TIMEOUT_MS = 10_000;

pb.beforeSend = (url, options) => {
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
	options.signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
	return { url, options };
};
