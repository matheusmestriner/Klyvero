import { NextRequest, NextResponse } from 'next/server';

export function middleware(_request: NextRequest) {
  if (process.env.KLYVERO_SERVICE_DISABLED === '1') {
    return new NextResponse('This deployment has been retired.', {
      status: 410,
      headers: {
        'cache-control': 'no-store, max-age=0',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
