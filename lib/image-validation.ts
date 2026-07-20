export function validateDisplayImage(url: string): Promise<{
  valid: boolean;
  width: number;
  height: number;
}> {
  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        valid: image.naturalWidth >= 900 && image.naturalHeight >= 500,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => resolve({ valid: false, width: 0, height: 0 });
    image.src = url;
  });
}
