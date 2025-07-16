// Firebase config
const firebaseConfig = {
	apiKey: "AIzaSyBgb0ZwgT4sn0S2L1j2rxNWdPxl_4ul-eo",
	authDomain: "tlg-meta-wall.firebaseapp.com",
	projectId: "tlg-meta-wall",
	storageBucket: "tlg-meta-wall.appspot.com",
	messagingSenderId: "790649676853",
	appId: "1:790649676853:web:282907debb5062b96b3d7c",
	measurementId: "G-ENLE1K8G8N"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// PIXI setup
const app = new PIXI.Application({
	resizeTo: window,
	backgroundColor: 0xf8f3e7 // beige hex
});
document.body.appendChild(app.view);

// Preload bubble images
const bubbleImages = [
	{ name: 'heart', url: 'assets/heart.png?v=1.0.0' },
	{ name: 'earth', url: 'assets/earth.png?v=1.0.0' },
    { name: 'speech', url: 'assets/speech2.png?v=1.0.1' }
];
const bubbleTextures = {};

async function setup() {
	// Register image assets
	bubbleImages.forEach(({ name, url }) => {
		PIXI.Assets.add(name, url);
	});

	// Load by alias
	await PIXI.Assets.load(bubbleImages.map(i => i.name));

	// Save to bubbleTextures
	bubbleImages.forEach(({ name }) => {
		bubbleTextures[name] = PIXI.Assets.get(name);
	});

	// All textures are now ready
	startApp();
}

// Wait for Montserrat font to load before starting the app
async function waitForFont(fontFamily) {
    await document.fonts.load(`1em ${fontFamily}`);
    await document.fonts.ready;
}

// Start the app only after the font is loaded
(async () => {
    await waitForFont('Montserrat');
    setup();
})();

function startApp() {
	// Animate
	app.ticker.add(() => {
		for (let i = 0; i < bubbles.length; i++) {
			const b1 = bubbles[i];
			b1.update();

			// Interactions with other bubbles
			for (let j = i + 1; j < bubbles.length; j++) {
				const b2 = bubbles[j];
				const dx = b1.sprite.x - b2.sprite.x;
				const dy = b1.sprite.y - b2.sprite.y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				const nx = dx / dist;
				const ny = dy / dist;

				// Soft repulsion if too close
				const minDist = b1.radius + b2.radius + 40;
				if (dist < minDist && dist > 1) {
					const push = (minDist - dist) * 0.007;
					b1.velocity.x += nx * push;
					b1.velocity.y += ny * push;
					b2.velocity.x -= nx * push;
					b2.velocity.y -= ny * push;
				}

				// Soft mutual attraction if ~medium distance
				else if (dist > minDist && dist < 400) {
					const pull = (400 - dist) * 0.00005;
					b1.velocity.x -= nx * pull;
					b1.velocity.y -= ny * pull;
					b2.velocity.x += nx * pull;
					b2.velocity.y += ny * pull;
				}
			}
		}

		// Remove offscreen
		for (let i = bubbles.length - 1; i >= 0; i--) {
			if (bubbles[i].isOffscreen()) {
				bubbles[i].destroy();
				bubbles.splice(i, 1);
			}
		}
	});

	// Firestore: listen to "thoughts", use "message" field
	db.collection("thoughts")
		.orderBy("timestamp", "desc")
		.limit(100)
		.onSnapshot(snapshot => {
			snapshot.docChanges().forEach(change => {
				if (change.type === "added") {
					const data = change.doc.data();
					const text = data.message;
					const colorValue = data.colour || 1;
					addBubble(text, colorValue);
				}
			});
		});
}

// Add a loading message to the center of the screen
let loadingText = new PIXI.Text('Loading...', {
    fontFamily: 'Arial',
    fontSize: 36,
    fill: 0x888888,
    align: 'center',
});
loadingText.anchor.set(0.5);
loadingText.x = window.innerWidth / 2;
loadingText.y = window.innerHeight / 2;
app.stage.addChild(loadingText);

// Bubble storage
const bubbles = [];
const MAX_BUBBLES = 100;

// Define text area for each shape, including text center offset
const shapeTextAreas = {
  heart:  { width: 120, height: 100, center: { x: 0, y: 0 } },
  earth:  { width: 120, height: 120, center: { x: 0, y: 0 } },
  speech: { width: 160, height: 110, center: { x: 0, y: -10 } }
};

// Fit text with dynamic font size, then truncate if needed
function fitTextWithDynamicFont(text, baseStyle, maxWidth, maxHeight, minFontSize, maxFontSize) {
    let fontSize = maxFontSize;
    let displayText = text;
    let style = { ...baseStyle, fontSize };
    let testText = new PIXI.Text('', style);
    testText.style.wordWrap = true;
    testText.style.wordWrapWidth = maxWidth;
    testText.visible = false;
    app.stage.addChild(testText);

    // Try to fit with decreasing font size
    while (fontSize >= minFontSize) {
        style.fontSize = fontSize;
        testText.style = style;
        testText.text = text;
        if (testText.height <= maxHeight && testText.width <= maxWidth) {
            app.stage.removeChild(testText);
            return { displayText: text, fontSize };
        }
        fontSize--;
    }

    // If still doesn't fit, truncate with ellipsis at minFontSize
    style.fontSize = minFontSize;
    testText.style = style;
    let truncated = text;
    let ellipsis = '...';
    let maxLen = text.length;
    while (maxLen > 0) {
        truncated = text.slice(0, maxLen) + ellipsis;
        testText.text = truncated;
        if (testText.height <= maxHeight && testText.width <= maxWidth) {
            app.stage.removeChild(testText);
            return { displayText: truncated, fontSize: minFontSize };
        }
        maxLen--;
    }
    app.stage.removeChild(testText);
    return { displayText: ellipsis, fontSize: minFontSize };
}

// Color mapping for message bubbles
const bubbleColors = {
    1: 0x0082fb, // Meta blue
    2: 0x6f4cff, // Meta purple
    3: 0x00c6b7  // Meta teal
};

// Rotation range for bubbles (in degrees)
const BUBBLE_ROTATION_RANGE = 5;

// Bubble class
class Bubble {
	constructor(text, colorValue) {
		this.radius = 100;
		this.sprite = new PIXI.Container();

		// Randomly pick a shape type for now
		const shapeTypes = Object.keys(bubbleTextures);
		this.shapeType = "speech";
		let imgSprite;
		switch (this.shapeType) {
			case 'heart':
				imgSprite = new PIXI.Sprite(bubbleTextures['heart']);
				break;
			case 'earth':
				imgSprite = new PIXI.Sprite(bubbleTextures['earth']);
				break;
			case 'speech':
				imgSprite = new PIXI.Sprite(bubbleTextures['speech']);
				break;
			default:
				imgSprite = new PIXI.Sprite(bubbleTextures['heart']); // fallback
		}
		imgSprite.anchor.set(0.5);
		// Scale image to fit the desired radius
		const scale = (this.radius * 2) / Math.max(imgSprite.texture.width, imgSprite.texture.height);
		imgSprite.width = imgSprite.texture.width * scale;
		imgSprite.height = imgSprite.texture.height * scale;
		imgSprite.x = 0;
		imgSprite.y = 0;
		// Add slight random rotation between -BUBBLE_ROTATION_RANGE and BUBBLE_ROTATION_RANGE degrees
		imgSprite.rotation = (Math.random() * 2 * BUBBLE_ROTATION_RANGE - BUBBLE_ROTATION_RANGE) * (Math.PI / 180);
		// Tint the image based on colorValue
		const colorKey = colorValue && bubbleColors[colorValue] ? colorValue : 1;
		imgSprite.tint = bubbleColors[colorKey];
		this.sprite.addChild(imgSprite);

		// Get text area for this shape
		const area = shapeTextAreas[this.shapeType] || { width: 120, height: 60, center: { x: 0, y: 0 } };
		const baseTextStyle = {
			fontFamily: 'Montserrat, Arial, sans-serif', // Gotham-like
			fontWeight: 'bold',
			fill: 0xffffff, // white text
			align: 'center',
			wordWrap: true,
			wordWrapWidth: area.width
		};
		const { displayText, fontSize } = fitTextWithDynamicFont(
			text, baseTextStyle, area.width, area.height, 10, 16 
		);
		const textStyle = { ...baseTextStyle, fontSize };
		const message = new PIXI.Text(displayText, textStyle);
		message.anchor.set(0.5);
		message.x = area.center?.x ?? 0;
		message.y = area.center?.y ?? 0;
		this.sprite.addChild(message);

		this.sprite.x = window.innerWidth / 2 + (Math.random() - 0.5) * 200;
		this.sprite.y = window.innerHeight / 2 + (Math.random() - 0.5) * 200;
		this.velocity = { x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.3 };

		app.stage.addChild(this.sprite);
	}

    update() {
        // Soft center pull
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const dx = centerX - this.sprite.x;
        const dy = centerY - this.sprite.y;
        this.velocity.x += dx * 0.00025;
        this.velocity.y += dy * 0.00025;
    
        // Damping
        this.velocity.x *= 0.98;
        this.velocity.y *= 0.98;
    
        // Clamp speed
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
        if (speed > 2) {
            const scale = 2 / speed;
            this.velocity.x *= scale;
            this.velocity.y *= scale;
        }
    
        this.sprite.x += this.velocity.x;
        this.sprite.y += this.velocity.y;

        // Add a small random jitter to keep bubbles moving
        this.velocity.x += (Math.random() - 0.5) * 0.05;
        this.velocity.y += (Math.random() - 0.5) * 0.05;
    }
    
	isOffscreen() {
		return (
			this.sprite.y + this.radius < -100 ||
			this.sprite.x + this.radius < -100 ||
			this.sprite.x - this.radius > window.innerWidth + 100
		);
	}

	destroy() {
		app.stage.removeChild(this.sprite);
	}
}

function addBubble(text, colorValue) {
	if (!text || text.length < 1) return;

	// Remove loading message on first bubble
	if (loadingText) {
		app.stage.removeChild(loadingText);
		loadingText = null;
	}

	// No more gibberish, just use the original text
	if (bubbles.length >= MAX_BUBBLES) {
		const old = bubbles.shift();
		old.destroy();
	}
	const bubble = new Bubble(text, colorValue);
	bubbles.push(bubble);
}
