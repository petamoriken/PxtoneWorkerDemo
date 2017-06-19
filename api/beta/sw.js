importScripts("../../lib/pxtnDecoder.js", "service.js");

(() => {

"use strict";

self.addEventListener("activate", e => {
    e.waitUntil(self.clients.claim());
});


const exReg = /\.pt(?:cop|tune)$/;
const wavReg = /^wave?$/;

const rangeReg = /(\d+)-(\d+)?/;

const CHANNEL = 2;
const SAMPLE_PER_SECOND = 44100;

function copyHeaders(_headers) {
    const headers = new Headers();
    for(const [key, val] of _headers.entries()) {
        headers.append(key, val);
    }
    return headers;
}

self.addEventListener("fetch", e => {
    const _request = e.request;

    const url = new URL(_request.url);
    if(!exReg.test(url.pathname))
        return;
    
    if(!wavReg.test(url.searchParams.get("type")))
        return;

    const _headers = _request.headers;
    const rangeStr = _headers.get("range");

    const [, ...range] = (rangeReg.exec(rangeStr || "") || []).map(e => e ? e | 0 : null);
    const isRangeRequest = typeof range[1] === "number";

    let headers, request;
    if(isRangeRequest) {

        headers = copyHeaders(_headers);
        headers.delete("range");

        request = new Request(_request.url, {
            method: _request.method,
            headers: headers,
            body: _request.body,
            mode: _request.mode,
            credentials: _request.credentials,
            cache: _request.cache,
            redirect: _request.redirect,
            referrer: _request.referrer,
            integrity: _request.integrity
        });

    } else {
        headers = _headers;
        request = _request;
    }

    e.respondWith((async () => {

        const response = await fetch(request);

        if(!response.ok)
            throw new Error(response.statusText);

        const service = new Service(CHANNEL, SAMPLE_PER_SECOND);

        const pxtn = await response.arrayBuffer();
        service.load(pxtn);

        const buffer = service.vomit(...range);
        service.delete();

        const status = isRangeRequest ? 206 : 200;

        const headers = copyHeaders(response.headers);
        headers.set("content-type", "audio/vnd.wave");
        headers.set("content-length", buffer.byteLength);

        if(isRangeRequest)
            headers.set("content-range", `bytes ${ range[0] }-${ range[1] === null ? service.byteLength-1 : range[1] }/${ service.byteLength }`);

        return new Response(buffer, { status, headers });
        
    })());
});

})();