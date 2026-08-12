import type { EncryptedOAuth2 } from '../types/types';
import env from './env';
import { supabase } from './supabase';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export async function hasOAuth2(user_id: string): Promise<boolean> {
  const { data, error } = await supabase.from('oauth2').select('user_id').eq('user_id', user_id).maybeSingle();

  if (error) {
    throw error;
  }

  return !!data && Object.keys(data).length > 0;
}

export async function getOauth2(user_id: string): Promise<any> {
  const { data, error } = await supabase.from('oauth2').select('*').eq('user_id', user_id).single();

  if (error) {
    throw error;
  }

  return data;
}

export function decryptOauth2(token: EncryptedOAuth2): string {
  const key = Buffer.from(env.get('oauth2_encryption_key', true).toString(), 'base64');

  const iv = Buffer.from(token.iv, 'base64');
  const tag = Buffer.from(token.tag, 'base64');
  const ciphertext = Buffer.from(token.ciphertext, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);

  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function encryptOauth2(token: string): EncryptedOAuth2 {
  const key = Buffer.from(env.get('oauth2_encryption_key', true).toString(), 'base64');

  if (key.length !== 32) {
    throw new Error('OAuth2 encryption key must be exactly 32 bytes');
  }

  const iv = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    algorithm: 'aes-256-gcm',
    ciphertext: ciphertext.toString('base64'),
  };
}
