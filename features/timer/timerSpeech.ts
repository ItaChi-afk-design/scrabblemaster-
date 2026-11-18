const isSpeechSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

export class CountdownSpeech {
  private lastSpokenSecond: number | null = null;

  announce(secondsLeft: number) {
    if (secondsLeft > 10) {
      this.reset();
      return;
    }
    if (secondsLeft < 1 || this.lastSpokenSecond === secondsLeft || !isSpeechSupported()) return;

    const synthesis = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(String(secondsLeft));
    const englishVoices = synthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    const preferredVoice =
      englishVoices.find((voice) => /male|david|guy|mark|daniel|james|alex|fred/i.test(voice.name)) ??
      englishVoices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    } else {
      utterance.lang = "en-US";
    }

    utterance.rate = 0.86;
    utterance.pitch = 0.58;
    utterance.volume = 1;
    synthesis.cancel();
    synthesis.speak(utterance);
    this.lastSpokenSecond = secondsLeft;
  }

  stop() {
    if (isSpeechSupported()) window.speechSynthesis.cancel();
    this.reset();
  }

  reset() {
    this.lastSpokenSecond = null;
  }
}
