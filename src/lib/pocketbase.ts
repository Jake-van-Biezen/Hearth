import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';

// Production: the app is served by PocketBase itself, so the API is same-origin.
// Dev: set PUBLIC_POCKETBASE_URL to the local PocketBase.
export const pb = new PocketBase(env.PUBLIC_POCKETBASE_URL || '/');
