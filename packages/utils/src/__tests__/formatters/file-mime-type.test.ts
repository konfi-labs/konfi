import { FileMimeType } from "../../formatters/file-mime-type";

describe("FileMimeType", () => {
  it("should return the correct file extension for known mime types", () => {
    expect(FileMimeType["audio/x-mpeg"]).toBe("mpega");
    expect(FileMimeType["application/postscript"]).toBe("ps");
    expect(FileMimeType["image/x-jg"]).toBe("art");
    expect(FileMimeType["video/x-ms-asf"]).toBe("asx");
    expect(FileMimeType["audio/basic"]).toBe("ulw");
    expect(FileMimeType["video/x-msvideo"]).toBe("avi");
    expect(FileMimeType["video/x-rad-screenplay"]).toBe("avx");
    expect(FileMimeType["application/x-bcpio"]).toBe("bcpio");
    expect(FileMimeType["application/octet-stream"]).toBe("exe");
    expect(FileMimeType["image/bmp"]).toBe("dib");
    expect(FileMimeType["text/html"]).toBe("html");
    expect(FileMimeType["application/x-cdf"]).toBe("cdf");
    expect(FileMimeType["application/pkix-cert"]).toBe("cer");
    expect(FileMimeType["application/java"]).toBe("class");
    expect(FileMimeType["application/x-cpio"]).toBe("cpio");
    expect(FileMimeType["application/x-csh"]).toBe("csh");
    expect(FileMimeType["text/css"]).toBe("css");
    expect(FileMimeType["application/msword"]).toBe("doc");
    expect(FileMimeType["application/xml-dtd"]).toBe("dtd");
    expect(FileMimeType["video/x-dv"]).toBe("dv");
    expect(FileMimeType["application/x-dvi"]).toBe("dvi");
    expect(FileMimeType["application/vnd.ms-fontobject"]).toBe("eot");
    expect(FileMimeType["text/x-setext"]).toBe("etx");
    expect(FileMimeType["image/gif"]).toBe("gif");
    expect(FileMimeType["application/x-gtar"]).toBe("gtar");
    expect(FileMimeType["application/x-gzip"]).toBe("gz");
    expect(FileMimeType["application/x-hdf"]).toBe("hdf");
    expect(FileMimeType["application/mac-binhex40"]).toBe("hqx");
    expect(FileMimeType["text/x-component"]).toBe("htc");
    expect(FileMimeType["image/ief"]).toBe("ief");
    expect(FileMimeType["text/vnd.sun.j2me.app-descriptor"]).toBe("jad");
    expect(FileMimeType["application/java-archive"]).toBe("jar");
    expect(FileMimeType["text/x-java-source"]).toBe("java");
    expect(FileMimeType["application/x-java-jnlp-file"]).toBe("jnlp");
  });

  it("should return undefined for unknown mime types", () => {
    expect(FileMimeType["unknown/mime-type"]).toBeUndefined();
    expect(FileMimeType["application/x-unknown"]).toBeUndefined();
    expect(FileMimeType["image/unknown"]).toBeUndefined();
    expect(FileMimeType["video/unknown"]).toBeUndefined();
    expect(FileMimeType["audio/unknown"]).toBeUndefined();
    expect(FileMimeType["text/unknown"]).toBeUndefined();
  });
});
