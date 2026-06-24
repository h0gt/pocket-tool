import { RequestMethod, ResponseType, type RequestOptions, type RequestResponse } from '../types/types';

export async function makeRequest<Type extends ResponseType>(url: string, options: RequestOptions<Type>): Promise<RequestResponse[Type]> {
  const parsedUrl = new URL(url);

  if (options.params) {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(options.params)) {
      searchParams.append(key, String(value));
    }

    parsedUrl.search = searchParams.toString();
  }

  const controller = new AbortController();
  const timeout = options.timeout ?? 60 * 1000;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(parsedUrl.toString(), {
      method: options.method,
      signal: controller.signal,
      ...(options.headers !== undefined && { headers: options.headers }),
      ...(options.body !== undefined &&
        options.method !== RequestMethod.GET && {
          body: JSON.stringify(options.body),
        }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Request failed (${res.status}): ${err}`);
    }

    switch (options.response) {
      case ResponseType.JSON: {
        return (await res.json()) as RequestResponse[Type];
      }
      case ResponseType.BUFFER: {
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer) as RequestResponse[Type];
      }
      case ResponseType.TEXT: {
        return (await res.text()) as RequestResponse[Type];
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Request timed out');

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
