export type DemoLang = "en" | "hi";

export interface Demo {
  id: string;
  label: string;
  lang: DemoLang;
  expressive: boolean;
  text: string;
}

// Plain-text demos are excerpted from Supertone's official preset-texts.js
// (Hugging Face Space "Supertone/supertonic-3"). Expression demos are written
// to showcase each supported tag.
export const DEMOS: Demo[] = [
  // ---------- English: plain ----------
  {
    id: "en-quote",
    lang: "en",
    expressive: false,
    label: "Quote",
    text:
      "This text-to-speech system runs entirely in your browser, providing fast and private operation without sending any data to external servers.",
  },
  {
    id: "en-paragraph",
    lang: "en",
    expressive: false,
    label: "Paragraph",
    text:
      "Flat white and cafe latte are both espresso-based drinks with milk. However, they differ clearly in the amount and texture of the milk, as well as in overall flavor balance. A flat white is designed to highlight the espresso, using a very thin layer of finely textured microfoam.",
  },

  // ---------- English: with expression ----------
  {
    id: "en-laugh",
    lang: "en",
    expressive: true,
    label: "Laugh",
    text:
      "So he tripped right in front of everyone, and we just <laugh> couldn't keep a straight face. Honestly, the look on his manager's face was the best part.",
  },
  {
    id: "en-breath",
    lang: "en",
    expressive: true,
    label: "Breath",
    text:
      "I ran the whole way from the station. <breath> Sorry I'm late — I really thought I had more time.",
  },
  {
    id: "en-sigh",
    lang: "en",
    expressive: true,
    label: "Sigh",
    text:
      "<sigh> What a long day. The meeting ran over by an hour and I still have three reports to finish before tomorrow morning.",
  },
  {
    id: "en-mixed",
    lang: "en",
    expressive: true,
    label: "Mixed",
    text:
      "<breath> Oh wow, that was close. I almost dropped my coffee in front of the whole team. <laugh> Imagine the headlines. <sigh> I really need a vacation.",
  },

  // ---------- Hindi: plain ----------
  {
    id: "hi-quote",
    lang: "hi",
    expressive: false,
    label: "Quote",
    text:
      "यह टेक्स्ट-टू-स्पीच प्रणाली पूरी तरह से आपके ब्राउज़र के भीतर ही चलती है। यह बाहरी सर्वर पर कोई डेटा भेजे बिना तेज़ और निजी संचालन प्रदान करती है।",
  },
  {
    id: "hi-paragraph",
    lang: "hi",
    expressive: false,
    label: "Paragraph",
    text:
      "फ्लैट व्हाइट और कैफे लाते दोनों ही दूध के साथ एस्प्रेसो पर आधारित पेय हैं। हालांकि, ये दूध की मात्रा और बनावट के साथ-साथ समग्र स्वाद के संतुलन में भी स्पष्ट रूप से भिन्न होते हैं। फ्लैट व्हाइट को एस्प्रेसो की विशेषता को उभारने के लिए बनाया गया है।",
  },

  // ---------- Hindi: with expression ----------
  {
    id: "hi-laugh",
    lang: "hi",
    expressive: true,
    label: "Laugh",
    text:
      "उसने ऐसी मज़ेदार बात बताई कि <laugh> मैं रुक ही नहीं पाया। पूरी बस के लोग हमारी तरफ देखने लगे थे।",
  },
  {
    id: "hi-breath",
    lang: "hi",
    expressive: true,
    label: "Breath",
    text:
      "मैं स्टेशन से भागते हुए आया हूँ। <breath> देर के लिए माफ़ करना, ट्रेन बीच रास्ते में रुक गई थी।",
  },
  {
    id: "hi-sigh",
    lang: "hi",
    expressive: true,
    label: "Sigh",
    text:
      "<sigh> आज का दिन बहुत लंबा था। मीटिंग एक घंटा अधिक चली, और अभी भी तीन रिपोर्ट्स बाकी हैं।",
  },
  {
    id: "hi-mixed",
    lang: "hi",
    expressive: true,
    label: "Mixed",
    text:
      "<breath> ओह, बाल-बाल बच गया। कॉफ़ी पूरी टीम के सामने गिरते-गिरते रुक गई। <laugh> सोचो ज़रा क्या होता! <sigh> अब छुट्टी की सख़्त ज़रूरत है।",
  },
];

export interface ExpressionTag {
  tag: string;
  description: string;
  example: string;
}

export const EXPRESSION_TAGS: ExpressionTag[] = [
  {
    tag: "<laugh>",
    description: "Brief laughter",
    example: "It was so absurd <laugh> we couldn't stop.",
  },
  {
    tag: "<breath>",
    description: "An audible inhale, useful between phrases",
    example: "I ran here. <breath> Sorry I'm late.",
  },
  {
    tag: "<sigh>",
    description: "An exhaled sigh, conveys fatigue or relief",
    example: "<sigh> What a long day.",
  },
];
