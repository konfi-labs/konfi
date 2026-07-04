import { Configuration, Product } from "@konfi/types";
import { isValidHeight, isValidSize, isValidWidth } from "../../validators";

describe("isValidSize", () => {
  const product = {
    spec: {
      minimumWidth: 10,
      maximumWidth: 100,
      widthStep: 5,
      minimumHeight: 20,
      maximumHeight: 200,
      heightStep: 10,
    },
  };

  const configuration = {
    customFormat: true,
  };

  it("should return true for valid width and height", () => {
    expect(
      isValidSize(15, 30, product as Product, configuration as Configuration),
    ).toBe(true);
  });

  it("should return false for invalid width", () => {
    expect(
      isValidSize(12, 30, product as Product, configuration as Configuration),
    ).toBe(false);
  });

  it("should return false for invalid height", () => {
    expect(
      isValidSize(15, 25, product as Product, configuration as Configuration),
    ).toBe(false);
  });

  it("should return true when customFormat is false", () => {
    const configWithoutCustomFormat = { ...configuration, customFormat: false };
    expect(
      isValidSize(
        15,
        25,
        product as Product,
        configWithoutCustomFormat as Configuration,
      ),
    ).toBe(true);
  });

  it("should return false when widthStep is not defined", () => {
    const productWithoutWidthStep = {
      spec: {
        minimumWidth: 10,
        maximumWidth: 100,
        minimumHeight: 20,
        maximumHeight: 200,
        heightStep: 10,
      },
    };

    expect(
      isValidSize(
        15,
        30,
        productWithoutWidthStep as Product,
        configuration as Configuration,
      ),
    ).toBe(false);
  });

  it("should return false when heightStep is not defined", () => {
    const productWithoutHeightStep = {
      spec: {
        minimumWidth: 10,
        maximumWidth: 100,
        minimumHeight: 20,
        maximumHeight: 200,
      },
    };

    expect(
      isValidSize(
        15,
        30,
        productWithoutHeightStep as Product,
        configuration as Configuration,
      ),
    ).toBe(false);
  });
});

describe("isValidWidth", () => {
  const product = {
    spec: {
      minimumWidth: 10,
      maximumWidth: 100,
      widthStep: 5,
    },
  };

  const configuration = {
    customFormat: true,
  };

  it("should return true for valid width", () => {
    expect(
      isValidWidth(15, product as Product, configuration as Configuration),
    ).toBe(true);
  });

  it("should return false for width less than minimumWidth", () => {
    expect(
      isValidWidth(5, product as Product, configuration as Configuration),
    ).toBe(false);
  });

  it("should return false for width greater than maximumWidth", () => {
    expect(
      isValidWidth(105, product as Product, configuration as Configuration),
    ).toBe(false);
  });

  it("should return false for width not matching widthStep", () => {
    expect(
      isValidWidth(12, product as Product, configuration as Configuration),
    ).toBe(false);
  });

  it("should return true when customFormat is false", () => {
    const configWithoutCustomFormat = { ...configuration, customFormat: false };
    expect(
      isValidWidth(
        12,
        product as Product,
        configWithoutCustomFormat as Configuration,
      ),
    ).toBe(true);
  });

  it("should return false when minimumWidth or maximumWidth is not defined", () => {
    const productWithoutWidth = {
      spec: {
        widthStep: 5,
        minimumHeight: 20,
        maximumHeight: 200,
        heightStep: 10,
      },
    };

    expect(
      isValidSize(
        15,
        30,
        productWithoutWidth as Product,
        configuration as Configuration,
      ),
    ).toBe(false);
  });
});

describe("isValidHeight", () => {
  const product = {
    spec: {
      minimumHeight: 20,
      maximumHeight: 200,
      heightStep: 10,
    },
  };

  const configuration = {
    customFormat: true,
  };

  it("should return true for valid height", () => {
    expect(
      isValidHeight(30, product as Product, configuration as Configuration),
    ).toBe(true);
  });

  it("should return false for height less than minimumHeight", () => {
    expect(
      isValidHeight(10, product as Product, configuration as Configuration),
    ).toBe(false);
  });

  it("should return false for height greater than maximumHeight", () => {
    expect(
      isValidHeight(210, product as Product, configuration as Configuration),
    ).toBe(false);
  });

  it("should return false for height not matching heightStep", () => {
    expect(
      isValidHeight(25, product as Product, configuration as Configuration),
    ).toBe(false);
  });

  it("should return true when customFormat is false", () => {
    const configWithoutCustomFormat = { ...configuration, customFormat: false };
    expect(
      isValidHeight(
        25,
        product as Product,
        configWithoutCustomFormat as Configuration,
      ),
    ).toBe(true);
  });

  it("should return false when minimumHeight or maximumHeight is not defined", () => {
    const productWithoutHeight = {
      spec: {
        minimumWidth: 10,
        maximumWidth: 100,
        widthStep: 5,
        heightStep: 10,
      },
    };

    expect(
      isValidSize(
        15,
        30,
        productWithoutHeight as Product,
        configuration as Configuration,
      ),
    ).toBe(false);
  });

  it("should handle floating-point precision with decimal steps", () => {
    const productWithDecimalStep = {
      spec: {
        minimumWidth: 0,
        maximumWidth: 100,
        widthStep: 0.01,
        minimumHeight: 0,
        maximumHeight: 100,
        heightStep: 0.01,
      },
    };

    expect(
      isValidWidth(
        1,
        productWithDecimalStep as Product,
        configuration as Configuration,
      ),
    ).toBe(true);
    expect(
      isValidHeight(
        1,
        productWithDecimalStep as Product,
        configuration as Configuration,
      ),
    ).toBe(true);
    expect(
      isValidSize(
        1,
        1,
        productWithDecimalStep as Product,
        configuration as Configuration,
      ),
    ).toBe(true);
  });
});
