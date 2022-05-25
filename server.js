const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

// require("dotenv").config();

const app = express();
const port = process.env.PORT || 1338;
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:1337",
    "https://evolution2art.com",
    "https://www.evolution2art.com",
    "https://new.evolution2art.com",
    "https://backend.evolution2art.com",
  ],
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));
app.use(express.json());

function fetchApi(path, options) {
  return fetch(`${process.env.STRAPI_API_URL}/api${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${process.env.STRAPI_JWT_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

async function getPayPalToken() {
  const result = await fetch(`${process.env.PAYPAL_URL}/v1/oauth2/token`, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET
      ).toString("base64")}`,
    },
    method: "POST",
    body: "grant_type=client_credentials",
  });
  return await result.json();
}

async function validatatePayPalOrder(pp) {
  const link = pp.links.shift();
  const auth = await getPayPalToken();
  const result = await fetch(link.href, {
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
    },
  });
  return await result.json();
}

app.get("/login", (req, res) => {
  res.send("Hello world");
});

app.post("/revalidate", async (req, res) => {
  const urlPaths = {
    fossil: "fossils",
    category: "categories",
  };
  const data = req.body;
  // console.log("Revalidate called with req", data);
  const { entry, model } = data;
  if (entry?.slug && urlPaths[model]) {
    // revalidate fossil & category pages only
    // console.log(
    //   `Calling revalidate for fossil path "${urlPaths[model]}/${entry.slug}"`
    // );
    await fetch(
      `${process.env.PUBLIC_URL}/api/revalidate?path=${urlPaths[model]}/${entry.slug}&secret=${process.env.NEXT_REVALIDATE_SECRET}`
    );

    // if fossil updated, also update its category page
    if (model === "fossil" && entry?.category?.slug) {
      // console.log(
      //   `Calling revalidate for category path "categories/${entry.category.slug}"`
      // );
      await fetch(
        `${process.env.PUBLIC_URL}/api/revalidate?path=categories/${entry.category.slug}&secret=${process.env.NEXT_REVALIDATE_SECRET}`
      );
    }
  }
  res.status(200).send();
});

app.post("/sell", async (req, res) => {
  const body = req.body;
  const order = await validatatePayPalOrder(body);
  // get order reference and extract item id's to update backend
  const purchase = order.purchase_units.shift();
  const { reference_id } = purchase;
  // reference is composed as follows
  // e2a-[total]|[idsJoinedWith:]-[datetime]
  const parts = reference_id.split("-");
  const ids = parts[1].split("|").pop().split(":");
  const results = [];
  // update backend
  await ids.map(async (id) => {
    // console.log(`Calling Strapi for id "${id}"`);
    const update = await fetchApi(`/fossils/${id}?populate=category`, {
      method: "PUT",
      body: JSON.stringify({ data: { sold: true } }),
    });
    const result = await update.json();
    // console.log(`Strapi update result`, result);
    const entry = result.data.attributes;
    // console.log(`Strapi update result category`, entry.category);
    // console.log(`Calling revalidate for fossil path "fossils/${entry.slug}"`);
    await fetch(
      `${process.env.PUBLIC_URL}/api/revalidate?path=fossils/${entry.slug}&secret=${process.env.NEXT_REVALIDATE_SECRET}`
    );
    const category = entry?.category?.data?.attributes;
    if (category?.slug) {
      // console.log(
      //   `Calling revalidate for category path "categories/${category.slug}"`
      // );
      await fetch(
        `${process.env.PUBLIC_URL}/api/revalidate?path=categories/${category.slug}&secret=${process.env.NEXT_REVALIDATE_SECRET}`
      );
    }
  });

  res.send(
    JSON.stringify({ message: "Fossil(s) succcessfully marked as sold" })
  );
});

/*
app.post("/reserve", async (req, res) => {
  if (validateRequest(req)) {
    const { id, pp } = req.body;
    const updateFossilRequest = await fetchApi(`/fossils/${id}`, {
      method: "put",
      body: JSON.stringify({
        data: { reserved: true },
      }),
    });

    const updateFossilResult = await updateFossilRequest.json();
    res.setHeader("Content-Type", "application/json");
    res.send(`Fossil ${id} reserved: ${JSON.stringify(updateFossilResult)}`);
  }
});

app.post("/release", async (req, res) => {
  if (validateRequest(req)) {
    const { id, pp } = req.body;
    const updateFossilRequest = await fetchApi(`/fossils/${id}`, {
      method: "put",
      body: JSON.stringify({
        data: { reserved: false },
      }),
    });

    const updateFossilResult = await updateFossilRequest.json();

    res.send(`Fossil ${id} released: ${JSON.stringify(updateFossilResult)}`);
  }
});
*/

app.listen(port, () => {
  console.log(`Auth app listening on port ${port}`);
});
