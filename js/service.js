/* global Module:false */


(() => {

"use strict";

const {
    HEAPU8,
    descriptor_create, descriptor_delete,
    service_create, service_delete, service_load, service_proparation, service_getTotalSample, service_vomit,
    _malloc, _free
} = Module;

function setAscii(uint8, offset, str) {
    for(let i = 0, l = str.length; i < l; ++i) {
        uint8[offset + i] = str.charCodeAt(i);
    }
}

const PXTN_BIT_PER_SAMPLE = 16;
const WAVE_HEADER_SIZE = 44;
const TEMP_BUFFER_SIZE = 4096;

self.Service = class Service {
    
    constructor(ch, sps) {
        this.channel = ch;
        this.sampleRate = sps;

        this.service = service_create(ch, sps);
        this.descripter = null;

        this.project = null;
        this.byteLength = null;
    }

    load(buffer) {
        const service = this.service;

        const length = buffer.byteLength;
        const project = this.project = _malloc(length);
        HEAPU8.set(new Uint8Array(buffer), project);

        const descripter = this.descripter = descriptor_create(project, length);

        return service_load(service, descripter);
    }

    vomit(start, end = null) {
        const { channel, sampleRate, service } = this;

        const totalSample = service_getTotalSample(this.service);
        
        this.byteLength = WAVE_HEADER_SIZE + totalSample;

        const startSample = start | 0;
        const endSample = (end === null || (end | 0) > totalSample) ? totalSample : (end | 0);

        const headerNeeds = startSample === 0;
        const contentLength = endSample - startSample;

        const allLength = (headerNeeds ? WAVE_HEADER_SIZE : 0) + contentLength;

        const buffer = new ArrayBuffer(allLength);
        const uint8 = new Uint8Array(buffer);
        const view = new DataView(buffer);

        let index = 0;

        // wave header
        if(headerNeeds) {
            setAscii(uint8, 0, "RIFF");
            view.setUint32(4, allLength, true);
            setAscii(uint8, 8, "WAVE");

            setAscii(uint8, 12, "fmt ");
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true); // Linear PCM

            view.setUint16(22, channel, true); // channel
            view.setUint32(24, sampleRate, true); // SampleRate
            view.setUint32(28, sampleRate * PXTN_BIT_PER_SAMPLE * channel / 8, true); // Bytes Per Sample
            view.setUint16(32, PXTN_BIT_PER_SAMPLE * channel, true); // Block Size
            view.setUint16(34, PXTN_BIT_PER_SAMPLE, true); // Bits Per Sample

            setAscii(uint8, 36, "data");
            view.setUint32(40, contentLength, true);

            index += WAVE_HEADER_SIZE;
        }

        service_proparation(service, startSample);

        // content
        const temp = _malloc(TEMP_BUFFER_SIZE);
        for(;;) {
            if(index >= allLength)
                break;

            const size = Math.min(allLength - index, TEMP_BUFFER_SIZE);
            service_vomit(service, temp, size);

            uint8.set( HEAPU8.subarray(temp, temp + size), index );
            index += size;
        }
        _free(temp);

        return buffer;
    }

    delete() {
        service_delete(this.service);
        descriptor_delete(this.descripter);
        if(this.project)    _free(this.project);
    }

}

})();