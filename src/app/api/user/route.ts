
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    // This functionality is currently disabled in the local-only version.
    return NextResponse.json({ success: true, message: "Local-only session active." });
}
