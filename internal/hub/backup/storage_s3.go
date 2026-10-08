package backup

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// s3Storage 通过 S3 兼容 API 存取备份（AWS S3 / Cloudflare R2 / MinIO /
// 阿里云 OSS / 腾讯云 COS 等）。使用 path-style 寻址与手写 AWS SigV4 签名，
// 不引入额外依赖。
//
// 环境变量：
//
//	BESZEL_HUB_BACKUP_S3_ENDPOINT         自定义端点；AWS 官方留空；
//	                                      R2 填 https://<账户ID>.r2.cloudflarestorage.com
//	BESZEL_HUB_BACKUP_S3_REGION           R2 用 auto；留空默认 us-east-1
//	BESZEL_HUB_BACKUP_S3_BUCKET           存储桶
//	BESZEL_HUB_BACKUP_S3_ACCESS_KEY_ID    Access Key
//	BESZEL_HUB_BACKUP_S3_SECRET_ACCESS_KEY Secret Key
type s3Storage struct {
	baseURL string // 不含 bucket，如 https://s3.us-east-1.amazonaws.com
	region  string
	bucket  string
	prefix  string // 对象 key 前缀，斜杠结尾
	ak, sk  string
	client  *http.Client
}

func newS3Storage(cfg Config) (Storage, error) {
	if cfg.S3Bucket == "" {
		return nil, fmt.Errorf("s3 存储缺少 BESZEL_HUB_BACKUP_S3_BUCKET")
	}
	if cfg.S3AccessKeyID == "" || cfg.S3SecretAccessKey == "" {
		return nil, fmt.Errorf("s3 存储缺少 BESZEL_HUB_BACKUP_S3_ACCESS_KEY_ID / _SECRET_ACCESS_KEY")
	}
	region := cfg.S3Region
	if region == "" {
		region = "us-east-1"
	}
	base := cfg.S3Endpoint
	if base == "" {
		base = "https://s3." + region + ".amazonaws.com"
	}
	prefix := strings.Trim(cfg.Path, "/")
	if prefix == "" {
		prefix = DefaultPath
	}
	return &s3Storage{
		baseURL: strings.TrimSuffix(base, "/"),
		region:  region,
		bucket:  cfg.S3Bucket,
		prefix:  prefix + "/",
		ak:      cfg.S3AccessKeyID,
		sk:      cfg.S3SecretAccessKey,
		client:  &http.Client{Timeout: 10 * time.Minute},
	}, nil
}

// hmacSHA256 计算 HMAC-SHA256。
func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

// s3URIEncode 按 SigV4 规则做 URI 编码（保留 "/" 与非保留字符）。
func s3URIEncode(s string) string {
	const hexDigits = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '.' || c == '_' || c == '~' || c == '/' {
			b.WriteByte(c)
		} else {
			b.WriteByte('%')
			b.WriteByte(hexDigits[c>>4])
			b.WriteByte(hexDigits[c&0xf])
		}
	}
	return b.String()
}

// canonicalQuery 构建排序后的规范化查询串。
func canonicalQuery(query url.Values) string {
	if len(query) == 0 {
		return ""
	}
	keys := make([]string, 0, len(query))
	for k := range query {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		for _, v := range query[k] {
			if b.Len() > 0 {
				b.WriteByte('&')
			}
			// SigV4 要求空格编码为 %20 而不是 +
			b.WriteString(strings.ReplaceAll(url.QueryEscape(k), "+", "%20"))
			b.WriteByte('=')
			b.WriteString(strings.ReplaceAll(url.QueryEscape(v), "+", "%20"))
		}
	}
	return b.String()
}

// do 发起一次带 SigV4 签名的 S3 请求。key 为空表示操作 bucket（列举对象），
// body 为 nil 表示空 body。成功时由调用方关闭 resp.Body。
func (s *s3Storage) do(ctx context.Context, method, key string, query url.Values, body []byte) (*http.Response, error) {
	if body == nil {
		body = []byte{}
	}
	path := "/" + s.bucket
	if key != "" {
		path += "/" + s3URIEncode(key)
	}
	q := canonicalQuery(query)
	fullURL := s.baseURL + path
	if q != "" {
		fullURL += "?" + q
	}

	// SigV4 签名材料
	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	payloadSum := sha256.Sum256(body)
	payloadHex := hex.EncodeToString(payloadSum[:])

	baseURL, err := url.Parse(s.baseURL)
	if err != nil {
		return nil, fmt.Errorf("无效的 S3 endpoint: %w", err)
	}

	canonicalHeaders := "host:" + baseURL.Host + "\n" +
		"x-amz-content-sha256:" + payloadHex + "\n" +
		"x-amz-date:" + amzDate + "\n"
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"

	canonicalRequest := strings.Join([]string{
		method, path, q, canonicalHeaders, signedHeaders, payloadHex,
	}, "\n")

	scope := dateStamp + "/" + s.region + "/s3/aws4_request"
	crSum := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		scope,
		hex.EncodeToString(crSum[:]),
	}, "\n")

	signingKey := hmacSHA256(hmacSHA256(hmacSHA256(hmacSHA256([]byte("AWS4"+s.sk), dateStamp), s.region), "s3"), "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))

	req, err := http.NewRequestWithContext(ctx, method, fullURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHex)
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+s.ak+"/"+scope+
		", SignedHeaders="+signedHeaders+", Signature="+signature)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		resp.Body.Close()
		return nil, fmt.Errorf("s3 %s %s: HTTP %d: %s", method, key, resp.StatusCode, string(data))
	}
	return resp, nil
}

func (s *s3Storage) Put(ctx context.Context, name string, data []byte) error {
	resp, err := s.do(ctx, http.MethodPut, s.prefix+name, nil, data)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// listBucketResult 是 ListObjectsV2 响应中关心的字段。
type listBucketResult struct {
	IsTruncated           bool   `xml:"IsTruncated"`
	NextContinuationToken string `xml:"NextContinuationToken"`
	Contents              []struct {
		Key string `xml:"Key"`
	} `xml:"Contents"`
}

func (s *s3Storage) List(ctx context.Context) ([]string, error) {
	var names []string
	var token string
	for {
		query := url.Values{"list-type": {"2"}, "prefix": {s.prefix}}
		if token != "" {
			query.Set("continuation-token", token)
		}
		resp, err := s.do(ctx, http.MethodGet, "", query, nil)
		if err != nil {
			return nil, err
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		var result listBucketResult
		if err := xml.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("解析 s3 列举响应: %w", err)
		}
		for _, c := range result.Contents {
			if name := strings.TrimPrefix(c.Key, s.prefix); isBackup(name) {
				names = append(names, name)
			}
		}
		if !result.IsTruncated || result.NextContinuationToken == "" {
			break
		}
		token = result.NextContinuationToken
	}
	sort.Strings(names)
	return names, nil
}

func (s *s3Storage) Get(ctx context.Context, name string) (io.ReadCloser, error) {
	resp, err := s.do(ctx, http.MethodGet, s.prefix+name, nil, nil)
	if err != nil {
		return nil, err
	}
	return resp.Body, nil
}

func (s *s3Storage) Delete(ctx context.Context, name string) error {
	resp, err := s.do(ctx, http.MethodDelete, s.prefix+name, nil, nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}
