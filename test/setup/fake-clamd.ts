import { createServer, type AddressInfo, type Server } from 'node:net';

export interface FakeClamd {
  readonly port: number;
  scans: number;
  close: () => Promise<void>;
}

/** Answers INSTREAM like clamd: FOUND for the EICAR test string, OK otherwise. */
export async function startFakeClamd(port = 0): Promise<FakeClamd> {
  const state = { scans: 0 };
  const server: Server = createServer((socket) => {
    let buffered = Buffer.alloc(0);
    socket.on('data', (data: Buffer) => {
      buffered = Buffer.concat([buffered, data]);
      if (buffered.length < 4 || buffered.subarray(buffered.length - 4).readUInt32BE(0) !== 0) {
        return;
      }
      state.scans += 1;
      socket.end(
        buffered.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')
          ? 'stream: Win.Test.EICAR_HDB-1 FOUND\0'
          : 'stream: OK\0',
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  return {
    port: (server.address() as AddressInfo).port,
    get scans() {
      return state.scans;
    },
    set scans(value: number) {
      state.scans = value;
    },
    close: () =>
      new Promise((resolve) =>
        server.close(() => {
          resolve();
        }),
      ),
  };
}
