import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, restoreSession } from "./api";

const user = {
  id: "u1",
  email: "op@kleankickx.com",
  name: "Operator",
  username: "op",
  role: "",
};

function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { success: false, error: { code: "x" } } },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("restoreSession", () => {
  it("returns the user when the access cookie is still valid", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: { success: true, data: user } });
    const refresh = vi.spyOn(axios, "post");

    await expect(restoreSession()).resolves.toEqual(user);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expired access cookie and asks again", async () => {
    const get = vi
      .spyOn(api, "get")
      .mockRejectedValueOnce(httpError(401))
      .mockResolvedValueOnce({ data: { success: true, data: user } });
    const refresh = vi
      .spyOn(axios, "post")
      .mockResolvedValue({ data: { success: true, data: null } });

    await expect(restoreSession()).resolves.toEqual(user);
    expect(refresh).toHaveBeenCalledWith(
      expect.stringContaining("/auth/token/refresh/"),
      {},
      expect.objectContaining({ withCredentials: true }),
    );
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("rejects when the refresh cookie is gone too", async () => {
    vi.spyOn(api, "get").mockRejectedValue(httpError(401));
    vi.spyOn(axios, "post").mockRejectedValue(httpError(401));

    await expect(restoreSession()).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it("does not try to refresh on other errors", async () => {
    vi.spyOn(api, "get").mockRejectedValue(httpError(500));
    const refresh = vi.spyOn(axios, "post");

    await expect(restoreSession()).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
