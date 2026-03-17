export const extractAudioSegment = async (source: File | AudioBuffer, start: number, end: number): Promise<Blob> => {
  let audioBuffer: AudioBuffer;

  if (source instanceof File) {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await source.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } else {
    audioBuffer = source;
  }

  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;
  
  const startOffset = Math.floor(start * sampleRate);
  const endOffset = Math.floor(end * sampleRate);
  const frameCount = endOffset - startOffset;

  const offlineContext = new OfflineAudioContext(channels, frameCount, sampleRate);
  const newBuffer = offlineContext.createBuffer(channels, frameCount, sampleRate);

  for (let channel = 0; channel < channels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    const newChannelData = newBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      newChannelData[i] = channelData[startOffset + i];
    }
  }

  return audioBufferToWav(newBuffer);
};

const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(pos, s.charCodeAt(i));
      pos++;
    }
  }

  // write WAVE header
  writeString('RIFF');
  setUint32(length - 8);
  writeString('WAVE');

  writeString('fmt ');
  setUint32(16);
  setUint16(1); // PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  writeString('data');
  setUint32(length - pos - 4);

  // write interleaved data
  const channels = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 0;
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // scale to 16-bit signed int
      view.setInt16(pos, sample, true); // write 16-bit sample
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
};
