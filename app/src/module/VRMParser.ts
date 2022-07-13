class VRMParser {

    // glTF2.0 glb フォーマット
    // https://www.khronos.org/registry/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification

    static IS_LITTLE_ENDIAN = true
    static HEADER_MAGIC = 0x46546C67
    static CHUNK_TYPE_JSON = 0x4E4F534A
    static CHUNK_TYPE_BIN = 0x004E4942

    static CHUNK_HEADER_SIZE = 12
    static CHUNK_LENGTH_SIZE = 4
    static CHUNK_TYPE_SIZE = 4

    static json?: any
    static images: any[] = []

    static callback: (json: any, images: any[]) => void

    //VRM パース
    public static parse = (file: File, callback: (json: any, images: any[]) => void) => {
        console.log('parse', file)
        VRMParser.callback = callback;

        const reader = new FileReader()
        reader.onload = VRMParser.onLoadVRMFile
        reader.readAsArrayBuffer(file)
    }

    private static onLoadVRMFile = async (event: any) => {
        // console.log('onLoadVRMFile', event)
        // console.log('total', event.total)        
        const raw: ArrayBuffer = event.currentTarget.result
        // DataView バイナリデータ読み書きオブジェクト
        const src = new DataView(raw)
        // TODO Header, Chunks を取り出す
        // Header 12-byte        
        const header = VRMParser.parseHeader(src)
        // console.log('magic', header.magicToStr)
        if (header.magic != VRMParser.HEADER_MAGIC) {
            // glb じゃなかった
            console.warn('file is not GLB file');
            return;
        }
        console.log('magic', VRMParser.toHexStr(header.magic))
        console.log('version', header.version)
        console.log('length', header.length)

        // Chunks 0 を jsonとしてパース
        const chunk0 = VRMParser.parseChunk0(src, VRMParser.CHUNK_HEADER_SIZE)
        if (typeof chunk0 == 'undefined') {
            return
        }
        console.log('chunk0', chunk0)
        VRMParser.json = chunk0.json

        // Chunks 1 を 取得
        const chunk1Offset = VRMParser.CHUNK_HEADER_SIZE 
            + VRMParser.CHUNK_LENGTH_SIZE 
            + VRMParser.CHUNK_TYPE_SIZE 
            + chunk0.chunkLength
        const chunk1 = VRMParser.parseChunk1(src, chunk1Offset)
        if (typeof chunk1?.chunkData == 'undefined') {
            return
        }
        console.log('chunk1', chunk1)

        // テクスチャを取り出す images, bufferViews
        VRMParser.loadImages(chunk1.chunkData, VRMParser.json)
            .then(images => {
                VRMParser.images = images
                console.log('images', VRMParser.images)

                // コールバックする
                VRMParser.callback(VRMParser.json, VRMParser.images)
            })
            .catch(e => {
                console.error('e', e)
            })
    }

    private static toHexStr = (value: number) => {
        return '0x' + value.toString(16).toUpperCase()
    }

    /* Header 12-byte
    uint32 magic
    uint32 version
    uint32 length
    */
    private static parseHeader = (src: DataView) => {
        console.log('src', src)
        const magic = src.getUint32(0, VRMParser.IS_LITTLE_ENDIAN)
        const version = src.getUint32(4, VRMParser.IS_LITTLE_ENDIAN)
        const length = src.getUint32(8, VRMParser.IS_LITTLE_ENDIAN)
        return {magic, version, length}
    }

    /* Chunks
    uint32 chunkLength
    uint32 chunkType
    ubyte[] chunkData
    */
    private static parseChunk = (type: number, src: DataView, offset: number) => {
        console.log('parseChunk', src, offset)
        const chunkLength = src.getUint32(offset, VRMParser.IS_LITTLE_ENDIAN)
        const chunkType = src.getUint32(offset + VRMParser.CHUNK_LENGTH_SIZE, VRMParser.IS_LITTLE_ENDIAN)
        if (type != chunkType) {
            console.warn('not JSON.');
            return;
        }

        // データを取り出す
        const chunkData = new Uint8Array(src.buffer,
            offset + VRMParser.CHUNK_LENGTH_SIZE + VRMParser.CHUNK_TYPE_SIZE,             
            chunkLength)

        return {chunkLength, chunkData}
    }

    // JSON 部分を取り出す
    private static parseChunk0 = (src: DataView, offset: number) => {
        console.log('parseChunk0', src, offset)
        const chunk = VRMParser.parseChunk(VRMParser.CHUNK_TYPE_JSON, src, offset)
        if (typeof chunk == 'undefined') {
            return
        }

        const chunkLength = chunk.chunkLength
        const decoder = new TextDecoder("utf8")
        const jsonText = decoder.decode(chunk.chunkData)
        const json = JSON.parse(jsonText)
        
        return {chunkLength, json}
    }

    // バイナリ部分を取り出す  
    private static parseChunk1 = (src: DataView, offset: number) => {
        console.log('parseChunk1', src, offset)
        const chunk = VRMParser.parseChunk(VRMParser.CHUNK_TYPE_BIN, src, offset)
        if (typeof chunk == 'undefined') {
            return
        }
        const chunkLength = chunk.chunkLength
        const chunkData = chunk.chunkData

        return {chunkLength, chunkData}
    }

    // テクスチャを取り出す images, bufferViews
    private static loadImages = (chunkData: ArrayBuffer, json: any): Promise<any[]> => {
        // console.log('loadImages', json.images)
        // console.log('chunkData', chunkData)
        return new Promise((resolve, reject) => {
            const images: any[] = []
            json.images
                .forEach((v: any) => {                
                const bufferView = json.bufferViews[v.bufferView]
                // new Uint8Array はうまく動作しない
                // const buf = new Uint8Array(chunkData, bufferView.byteOffset, bufferView.byteLength)
                const buf = chunkData.slice(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength)
                const blob = new Blob([buf], {type: v.mimeType})

                const img = URL.createObjectURL(blob)
                images.push({
                    index: v.bufferView,
                    name: v.name,
                    mimeType: v.mimeType,
                    src: img,
                    size: blob.size
                })
            })
            resolve(images)
        })
    }
}

export default VRMParser;